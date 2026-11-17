//! Filesystem workspace command format.
//!
//! The metadata line is JSON (also valid YAML) between Markdown front-matter
//! delimiters. The command is inside an adaptive backtick fence. One newline
//! before the closing fence is structural and is not part of the command.

use serde::{Deserialize, Serialize};

const HEADER: &str = "---\n";
const HEADER_END: &str = "\n---\n";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandMetadata {
    pub id: String,
    pub favorite: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandFile {
    pub metadata: CommandMetadata,
    pub body: String,
}

pub fn encode_command(command: &CommandFile) -> Result<String, String> {
    if command.metadata.id.trim().is_empty() {
        return Err("Command ID must not be empty".into());
    }
    let metadata = serde_json::to_string(&command.metadata).map_err(|error| error.to_string())?;
    let longest = command
        .body
        .split(|character| character != '`')
        .map(str::len)
        .max()
        .unwrap_or(0);
    let fence = "`".repeat(longest.max(2) + 1);
    Ok(format!(
        "{HEADER}{metadata}{HEADER_END}{fence}sh\n{}\n{fence}\n",
        command.body
    ))
}

pub fn decode_command(input: &str) -> Result<CommandFile, String> {
    let remaining = input
        .strip_prefix(HEADER)
        .ok_or("Missing CmdPad front matter")?;
    let (metadata, remaining) = remaining
        .split_once(HEADER_END)
        .ok_or("Invalid CmdPad front matter")?;
    let metadata: CommandMetadata =
        serde_json::from_str(metadata).map_err(|error| format!("Invalid metadata: {error}"))?;
    if metadata.id.trim().is_empty() {
        return Err("Command ID must not be empty".into());
    }
    let (opening, content) = remaining.split_once('\n').ok_or("Missing code fence")?;
    let fence_len = opening.bytes().take_while(|byte| *byte == b'`').count();
    if fence_len < 3 || &opening[fence_len..] != "sh" {
        return Err("Invalid code fence".into());
    }
    let closing = format!("\n{}\n", "`".repeat(fence_len));
    let body = content
        .strip_suffix(&closing)
        .ok_or("Missing closing code fence")?;
    Ok(CommandFile {
        metadata,
        body: body.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn commands_round_trip_exactly() {
        for body in [
            "",
            "echo hi",
            "echo hi\n",
            "\n\n  echo hi\n\n",
            "printf '```'\n````\n",
            "echo '---'\r\n☃\r\n",
        ] {
            let command = CommandFile {
                metadata: CommandMetadata {
                    id: "command-1".into(),
                    favorite: true,
                },
                body: body.into(),
            };
            assert_eq!(
                decode_command(&encode_command(&command).unwrap()),
                Ok(command)
            );
        }
    }

    #[test]
    fn rejects_unrecognized_or_incomplete_files() {
        assert!(decode_command("echo hi").is_err());
        assert!(
            decode_command("---\n{\"id\":\"x\",\"favorite\":false}\n---\n```sh\necho hi").is_err()
        );
        assert!(
            decode_command("---\n{\"id\":\"\",\"favorite\":false}\n---\n```sh\n\n```\n").is_err()
        );
    }
}
