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

pub struct ProxyState {
    running: Arc<AtomicBool>,
    request_count: Arc<AtomicU64>,
    port: Mutex<u16>,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            request_count: Arc::new(AtomicU64::new(0)),
            port: Mutex::new(8080),
            shutdown: Mutex::new(None),
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

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept = listener.accept() => {
                        match accept {
                            Ok((stream, _)) => {
                                let client = client.clone();
                                let backend = backend_url.clone();
                                count.fetch_add(1, Ordering::SeqCst);
                                tokio::spawn(async move {
                                    let io = TokioIo::new(stream);
                                    let svc = service_fn(move |req| {
                                        proxy_handler(req, backend.clone(), client.clone())
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
}

async fn proxy_handler<C: Connect + Clone + Send + Sync + 'static>(
    req: Request<Incoming>,
    backend_url: String,
    client: Arc<Client<C, Full<Bytes>>>,
) -> Result<Response<BoxBody>, hyper::Error> {
    if backend_url.is_empty() {
        return Ok(Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .body(full("Proxy not configured"))
            .unwrap());
    }

    let method = req.method().clone();
    let path = req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("/").to_owned();

    // Extract headers before consuming the body
    let mut forward_headers = Vec::new();
    for (name, value) in req.headers().iter() {
        let n = name.as_str().to_lowercase();
        if n != "host" && n != "connection" {
            forward_headers.push((name.clone(), value.clone()));
        }
    }

    let body_bytes = req.collect().await.map(|b| b.to_bytes()).unwrap_or_default();
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

    let (parts, body) = upstream.into_parts();
    Ok(Response::from_parts(parts, body.boxed_unsync()))
}
