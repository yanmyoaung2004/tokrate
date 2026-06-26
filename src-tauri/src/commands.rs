use crate::proxy::{ProxyRunBuffer, ProxyState, ProxyStatus};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use sysinfo::System;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HardwareInfo {
    pub os: String,
    pub cpu: String,
    pub ram: String,
    pub gpu: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BenchmarkRun {
    pub id: String,
    pub timestamp: u64,
    pub engine: String,
    pub model: String,
    pub prompt: String,
    pub response: String,
    pub tps: f64,
    pub ttft: f64,
    pub tpot: f64,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub source: String,
}

pub struct AppState {
    pub runs: Mutex<Vec<BenchmarkRun>>,
}

#[tauri::command]
pub fn get_hardware_info() -> HardwareInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let os = System::long_os_version()
        .unwrap_or_else(|| System::name().unwrap_or_else(|| "Unknown".into()));

    let cpu = sys
        .cpus()
        .first()
        .map(|c| format!("{} ({} cores)", c.brand(), sys.cpus().len()))
        .unwrap_or_else(|| "Unknown CPU".into());

    let ram = format!(
        "{} GB / {} GB",
        sys.used_memory() / (1024 * 1024 * 1024),
        sys.total_memory() / (1024 * 1024 * 1024)
    );

    let gpu = "Auto-detected (see system info)".into();

    HardwareInfo {
        os,
        cpu,
        ram,
        gpu,
    }
}

#[tauri::command]
pub fn save_run(state: State<AppState>, run: BenchmarkRun) -> Result<(), String> {
    let mut runs = state.runs.lock().map_err(|e| e.to_string())?;
    runs.push(run);
    Ok(())
}

#[tauri::command]
pub fn list_runs(state: State<AppState>) -> Result<Vec<BenchmarkRun>, String> {
    let runs = state.runs.lock().map_err(|e| e.to_string())?;
    let mut sorted = runs.clone();
    sorted.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(sorted)
}

#[tauri::command]
pub fn delete_run(state: State<AppState>, id: String) -> Result<(), String> {
    let mut runs = state.runs.lock().map_err(|e| e.to_string())?;
    runs.retain(|r| r.id != id);
    Ok(())
}

// ── Proxy commands ──

#[tauri::command]
pub fn proxy_start(proxy: State<ProxyState>, port: u16, backend_url: String) -> Result<(), String> {
    proxy.start(port, backend_url)
}

#[tauri::command]
pub fn proxy_stop(proxy: State<ProxyState>) -> Result<(), String> {
    proxy.stop();
    Ok(())
}

#[tauri::command]
pub fn proxy_status(proxy: State<ProxyState>) -> ProxyStatus {
    proxy.status()
}

#[tauri::command]
pub fn proxy_drain_runs(proxy: State<ProxyState>) -> Vec<ProxyRunBuffer> {
    proxy.drain_runs()
}
