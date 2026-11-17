//! Content fingerprints used to detect external edits before replacing a file.

use crate::workspace_format::decode_command;
use serde::Serialize;
use std::{collections::BTreeMap, fs, io::Read, path::Path};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CommandRevision {
    pub path: String,
    pub fingerprint: String,
}

/// Map of stable command ID to its current file location and fingerprint.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct CommandRevisions(pub BTreeMap<String, CommandRevision>);

fn fingerprint(bytes: &[u8]) -> String {
    // FNV-1a is used for change detection, not security.
    let mut hash = 0xcbf29ce484222325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

pub fn collect(root: &Path) -> Result<CommandRevisions, String> {
    let mut revisions = BTreeMap::new();

    fn walk(
        root: &Path,
        directory: &Path,
        revisions: &mut BTreeMap<String, CommandRevision>,
    ) -> Result<(), String> {
        for entry in fs::read_dir(directory)
            .map_err(|error| format!("Cannot read {}: {error}", directory.display()))?
        {
            let entry = entry.map_err(|error| error.to_string())?;
            let file_type = entry.file_type().map_err(|error| error.to_string())?;
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                walk(root, &entry.path(), revisions)?;
            } else if file_type.is_file() {
                let name = entry.file_name();
                let Some(name) = name.to_str() else { continue };
                if !name.ends_with(".cmd.md") {
                    continue;
                }
                let mut file = fs::File::open(entry.path())
                    .map_err(|error| format!("Cannot read {}: {error}", entry.path().display()))?;
                let mut bytes = Vec::new();
                file.read_to_end(&mut bytes)
                    .map_err(|error| format!("Cannot read {}: {error}", entry.path().display()))?;
                let text = std::str::from_utf8(&bytes)
                    .map_err(|_| format!("Command is not UTF-8: {}", entry.path().display()))?;
                let parsed = decode_command(text).map_err(|error| {
                    format!("Invalid command {}: {error}", entry.path().display())
                })?;
                let relative = entry
                    .path()
                    .strip_prefix(root)
                    .map_err(|error| error.to_string())?
                    .to_string_lossy()
                    .replace('\\', "/");
                revisions.insert(
                    parsed.metadata.id,
                    CommandRevision {
                        path: relative,
                        fingerprint: fingerprint(&bytes),
                    },
                );
            }
        }
        Ok(())
    }

    walk(root, &root.join("collections"), &mut revisions)?;
    walk(root, &root.join("unfiled"), &mut revisions)?;
    Ok(CommandRevisions(revisions))
}

pub fn path_matches(root: &Path, relative: &str, expected: &str) -> Result<(), String> {
    let path = root.join(relative);
    let bytes =
        fs::read(&path).map_err(|error| format!("The command was moved or deleted: {error}"))?;
    if fingerprint(&bytes) != expected {
        return Err("The command was changed by someone else. Reload and try again.".into());
    }
    Ok(())
}
