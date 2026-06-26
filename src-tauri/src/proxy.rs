use bytes::Bytes;
use hyper::body::Incoming;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::client::legacy::connect::Connect;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;
use hyper_util::rt::TokioIo;
use http_body_util::{BodyExt, Full};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::oneshot;

type BoxBody = http_body_util::combinators::UnsyncBoxBody<Bytes, hyper::Error>;

fn full<T: Into<Bytes>>(chunk: T) -> BoxBody {
    Full::new(chunk.into())
        .map_err(|never: Infallible| match never {})
        .boxed_unsync()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub running: bool,
    pub port: u16,
    pub request_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyRunBuffer {
    pub id: String,
    pub model: String,
    pub prompt: String,
    pub response: String,
    pub ttft_ms: f64,
    pub tps: f64,
    pub tpot_ms: f64,
    pub duration_ms: u64,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub timestamp: u64,
}

pub struct ProxyState {
    running: Arc<AtomicBool>,
    request_count: Arc<AtomicU64>,
    port: Mutex<u16>,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
    runs: Arc<Mutex<Vec<ProxyRunBuffer>>>,
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            request_count: Arc::new(AtomicU64::new(0)),
            port: Mutex::new(8080),
            shutdown: Mutex::new(None),
            runs: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn start(&self, port: u16, backend_url: String) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            return Err("Proxy already running".into());
        }

        let addr = format!("0.0.0.0:{}", port);
        let listener = tokio::runtime::Handle::current()
            .block_on(tokio::net::TcpListener::bind(&addr))
            .map_err(|e| format!("Failed to bind port {port}: {e}"))?;

        let (tx, mut rx) = oneshot::channel::<()>();
        *self.port.lock().unwrap() = port;
        *self.shutdown.lock().unwrap() = Some(tx);
        self.running.store(true, Ordering::SeqCst);

        let running = self.running.clone();
        let count = self.request_count.clone();
        let client = Arc::new(Client::builder(TokioExecutor::new()).build_http());
        let runs = self.runs.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept = listener.accept() => {
                        match accept {
                            Ok((stream, _)) => {
                                let client = client.clone();
                                let backend = backend_url.clone();
                                let runs = runs.clone();
                                count.fetch_add(1, Ordering::SeqCst);
                                tokio::spawn(async move {
                                    let io = TokioIo::new(stream);
                                    let svc = service_fn(move |req| {
                                        proxy_handler(req, backend.clone(), client.clone(), runs.clone())
                                    });
                                    let _ = http1::Builder::new()
                                        .serve_connection(io, svc)
                                        .await;
                                });
                            }
                            Err(_) => break,
                        }
                    }
                    _ = &mut rx => break,
                }
            }
            running.store(false, Ordering::SeqCst);
        });

        Ok(())
    }

    pub fn stop(&self) {
        if let Some(tx) = self.shutdown.lock().unwrap().take() {
            let _ = tx.send(());
        }
    }

    pub fn status(&self) -> ProxyStatus {
        ProxyStatus {
            running: self.running.load(Ordering::SeqCst),
            port: *self.port.lock().unwrap(),
            request_count: self.request_count.load(Ordering::SeqCst),
        }
    }

    pub fn drain_runs(&self) -> Vec<ProxyRunBuffer> {
        let mut runs = self.runs.lock().unwrap();
        let drained = runs.clone();
        runs.clear();
        drained
    }
}

fn parse_sse_metrics(body: &str) -> (u32, String, String) {
    let mut completion_tokens: u32 = 0;
    let mut response_text = String::new();
    let mut full_text = String::new();

    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(data) = trimmed.strip_prefix("data: ") {
            if data == "[DONE]" {
                continue;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                // Extract usage
                if let Some(usage) = json.get("usage") {
                    if let Some(ct) = usage.get("completion_tokens").and_then(|v| v.as_u64()) {
                        completion_tokens = ct as u32;
                    }
                }
                // Extract delta content
                if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
                    if let Some(first) = choices.first() {
                        if let Some(delta) = first.get("delta") {
                            if let Some(c) = delta.get("content").and_then(|c| c.as_str()) {
                                response_text.push_str(c);
                                if completion_tokens == 0 {
                                    completion_tokens += 1;
                                }
                            }
                            if let Some(r) = delta.get("reasoning_content").and_then(|c| c.as_str()) {
                                full_text.push_str(r);
                            }
                        }
                    }
                }
            }
        }
    }
    (completion_tokens, response_text, full_text)
}

fn extract_model_from_json(body: &[u8]) -> String {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&String::from_utf8_lossy(body)) {
        if let Some(model) = json.get("model").and_then(|m| m.as_str()) {
            return model.to_string();
        }
    }
    String::new()
}

fn extract_prompt_from_json(body: &[u8]) -> String {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&String::from_utf8_lossy(body)) {
        if let Some(messages) = json.get("messages").and_then(|m| m.as_array()) {
            let texts: Vec<String> = messages
                .iter()
                .filter_map(|msg| msg.get("content").and_then(|c| c.as_str()))
                .map(|s| s.to_string())
                .collect();
            return texts.join(" | ");
        }
    }
    String::new()
}

#[allow(clippy::too_many_arguments)]
async fn proxy_handler<C: Connect + Clone + Send + Sync + 'static>(
    req: Request<Incoming>,
    backend_url: String,
    client: Arc<Client<C, Full<Bytes>>>,
    runs: Arc<Mutex<Vec<ProxyRunBuffer>>>,
) -> Result<Response<BoxBody>, hyper::Error> {
    if backend_url.is_empty() {
        return Ok(Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .body(full("Proxy not configured"))
            .unwrap());
    }

    let start = Instant::now();
    let method = req.method().clone();
    let path = req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("/").to_owned();

    let mut forward_headers = Vec::new();
    for (name, value) in req.headers().iter() {
        let n = name.as_str().to_lowercase();
        if n != "host" && n != "connection" {
            forward_headers.push((name.clone(), value.clone()));
        }
    }

    // Extract model and prompt from request body before consuming
    let body_bytes = req.collect().await.map(|b| b.to_bytes()).unwrap_or_default();
    let model_name = extract_model_from_json(&body_bytes);
    let prompt_text = extract_prompt_from_json(&body_bytes);

    let forward_url = format!("{}{}", backend_url.trim_end_matches('/'), path);

    let mut builder = Request::builder().method(&method).uri(&forward_url);
    for (name, value) in &forward_headers {
        builder = builder.header(name, value);
    }
    if let Some(host) = hyper::Uri::try_from(&forward_url).ok().and_then(|u| u.host().map(String::from)) {
        builder = builder.header("Host", host);
    }
    let forward_req = builder.body(Full::new(body_bytes)).unwrap();

    let upstream = match client.request(forward_req).await {
        Ok(r) => r,
        Err(e) => {
            return Ok(Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(full(format!("Upstream error: {e}")))
                .unwrap());
        }
    };

    let is_chat = path.contains("/chat/completions");
    let (parts, body) = upstream.into_parts();

    // Collect the entire body to measure and forward
    let collected = body.collect().await.map(|b| b.to_bytes()).unwrap_or_default();
    let duration = start.elapsed().as_millis() as u64;

    // Parse metrics from the response
    let mut ttft_ms = duration as f64;
    let mut completion_tokens: u32 = 0;
    let mut response_text = String::new();

    if is_chat {
        let body_str = String::from_utf8_lossy(&collected);

        if body_str.contains("data: ") {
            // SSE streaming response
            let (tokens, resp, _reasoning) = parse_sse_metrics(&body_str);
            // Estimate TTFT: first chunk is typically sent within first 10% of duration
            // Use a fraction of total time as rough proxy
            ttft_ms = (duration as f64) * 0.05;
            completion_tokens = tokens;
            response_text = resp;
        } else if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body_str) {
            // Non-streaming JSON response
            if let Some(usage) = json.get("usage") {
                if let Some(ct) = usage.get("completion_tokens").and_then(|v| v.as_u64()) {
                    completion_tokens = ct as u32;
                }
            }
            if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
                if let Some(first) = choices.first() {
                    if let Some(msg) = first.get("message") {
                        if let Some(content) = msg.get("content").and_then(|c| c.as_str()) {
                            response_text = content.to_string();
                        }
                    }
                }
            }
            ttft_ms = duration as f64;
        }
    }

    let tps = if duration > 0 && completion_tokens > 0 {
        completion_tokens as f64 / (duration as f64 / 1000.0)
    } else {
        0.0
    };

    let tpot_ms = if completion_tokens > 0 {
        (duration as f64 - ttft_ms) / completion_tokens as f64
    } else {
        0.0
    };

    // Save run if it was a chat completion with some tokens
    if is_chat && (completion_tokens > 0 || !response_text.is_empty()) {
        let run_id = uuid::Uuid::new_v4().to_string();
        let run = ProxyRunBuffer {
            id: run_id,
            model: model_name,
            prompt: prompt_text,
            response: response_text,
            ttft_ms,
            tps,
            tpot_ms,
            duration_ms: duration,
            prompt_tokens: 0,
            completion_tokens,
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
        };
        if let Ok(mut buf) = runs.lock() {
            buf.push(run);
        }
    }

    // Build response to client
    let mut resp_builder = Response::builder().status(StatusCode::OK);
    for (name, value) in &parts.headers {
        let n = name.as_str().to_lowercase();
        if n != "transfer-encoding" {
            resp_builder = resp_builder.header(name, value);
        }
    }
    Ok(resp_builder.body(full(collected)).unwrap())
}
