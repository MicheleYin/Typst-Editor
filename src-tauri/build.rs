fn main() {
    tauri_build::build();

    let lock_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.lock");
    let lock = std::fs::read_to_string(&lock_path).expect("read Cargo.lock");
    let ver = package_version(&lock, "typst").unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=TYPST_ENGINE_VERSION={ver}");
    println!("cargo:rerun-if-changed=Cargo.lock");
}

/// Resolved version of the `typst` crate from Cargo.lock (actual compiler linked).
fn package_version(lock: &str, want_name: &str) -> Option<String> {
    for section in lock.split("[[package]]").skip(1) {
        let mut name: Option<&str> = None;
        let mut version: Option<&str> = None;
        for line in section.lines() {
            let t = line.trim();
            if let Some(rest) = t.strip_prefix("name = \"") {
                if let Some(n) = rest.strip_suffix('"') {
                    name = Some(n);
                }
            } else if let Some(rest) = t.strip_prefix("version = \"") {
                if let Some(v) = rest.strip_suffix('"') {
                    version = Some(v);
                }
            }
        }
        if name == Some(want_name) {
            return version.map(str::to_string);
        }
    }
    None
}
