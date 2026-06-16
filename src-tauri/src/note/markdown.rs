//! Which pictures a note's text actually points at.
//!
//! Used by the one-off legacy migrator, and the reason it is a parser rather
//! than a pattern: the migrator packs what it finds here and then moves the
//! original `.md` to the recycle bin, so a reference it fails to see is a
//! picture the note loses. `![alt][ref]` with the destination defined further
//! down the file, a path in angle brackets because it has a space in it, a path
//! written `assets/my%20shot.png`, and a plain `<img>` tag are all things people
//! have in their notes and all things a `!\[\]\(…\)` scan gets wrong — as is a
//! fenced code block that happens to contain the text of an image.

use pulldown_cmark::{Event, Options, Parser, Tag};

/// Every image destination in `source`, decoded, in the order they appear and
/// with repeats folded out.
pub fn image_references(source: &str) -> Vec<String> {
    // The same extensions the app's own renderer runs with. Images are found
    // the same way under all of them; matching keeps the two from ever
    // disagreeing about what is a code block and what is not.
    let options =
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH | Options::ENABLE_TASKLISTS;

    let mut found: Vec<String> = Vec::new();
    let mut remember = |destination: String| {
        if !destination.is_empty() && !found.contains(&destination) {
            found.push(destination);
        }
    };

    for event in Parser::new_ext(source, options) {
        match event {
            Event::Start(Tag::Image { dest_url, .. }) => remember(decode(&dest_url)),
            // Raw HTML is handed through untouched by design, so an `<img>` in
            // a note arrives here as text and has to be read as a tag.
            Event::Html(html) | Event::InlineHtml(html) => {
                for source in image_tag_sources(&html) {
                    remember(decode(&source));
                }
            }
            _ => {}
        }
    }

    found
}

fn decode(destination: &str) -> String {
    percent_encoding::percent_decode_str(destination)
        .decode_utf8()
        .map(|decoded| decoded.into_owned())
        .unwrap_or_else(|_| destination.to_owned())
}

/// The `src` of every `<img>` in a fragment of raw HTML.
///
/// Hand-written because this is pulling one attribute out of one tag, not
/// parsing a document: a second grammar would be more to be wrong about than
/// the thing it replaced.
fn image_tag_sources(html: &str) -> Vec<String> {
    let lowered = html.to_ascii_lowercase();
    let mut sources = Vec::new();
    let mut at = 0;

    while let Some(found) = lowered[at..].find("<img") {
        let start = at + found;
        let end = html[start..]
            .find('>')
            .map_or(html.len(), |offset| start + offset);
        if let Some(source) = src_attribute(&html[start..end]) {
            sources.push(source);
        }
        at = end;
    }

    sources
}

fn src_attribute(tag: &str) -> Option<String> {
    // Lowercasing ASCII leaves every byte offset where it was, so the two
    // strings can be indexed with the same numbers.
    let lowered = tag.to_ascii_lowercase();
    let mut at = 0;

    while let Some(found) = lowered[at..].find("src") {
        let name_end = at + found + "src".len();
        // `data-src` and `srcset` are other attributes with other meanings.
        let stands_alone = lowered[..at + found]
            .chars()
            .next_back()
            .is_some_and(char::is_whitespace);
        at = name_end;
        if !stands_alone || !lowered[name_end..].trim_start().starts_with('=') {
            continue;
        }

        let value = tag[name_end..].trim_start().get(1..)?.trim_start();
        return match value.chars().next() {
            Some(quote @ ('"' | '\'')) => value.get(1..)?.split(quote).next().map(str::to_owned),
            // Unquoted, so it ends at the first space — or at the slash of a
            // self-closing tag.
            Some(_) => value
                .split_whitespace()
                .next()
                .map(|source| source.trim_end_matches('/').to_owned()),
            None => None,
        };
    }

    None
}

#[cfg(test)]
mod tests {
    use super::image_references;

    #[test]
    fn finds_an_image_however_it_was_written() {
        let source = concat!(
            "![inline](assets/1.png)\n\n",
            "![reference][shot]\n\n",
            "![encoded](assets/my%20shot.png)\n\n",
            "![bracketed](<assets/another shot.png>)\n\n",
            "<img src=\"assets/4.png\" alt=\"tag\">\n\n",
            "[shot]: assets/2.png\n",
        );

        assert_eq!(
            image_references(source),
            vec![
                "assets/1.png",
                "assets/2.png",
                "assets/my shot.png",
                "assets/another shot.png",
                "assets/4.png",
            ]
        );
    }

    #[test]
    fn an_image_inside_a_code_block_is_not_a_reference() {
        // The migrator moves the original to the recycle bin, so packing a file
        // a note only ever talked *about* would be as wrong as missing one it
        // uses — and this is the case no amount of pattern-matching gets right.
        let source = "```\n![example](assets/never.png)\n```\n\n    ![indented](assets/nor-this.png)\n";
        assert!(image_references(source).is_empty());
    }

    #[test]
    fn the_same_picture_twice_is_one_reference() {
        let source = "![a](assets/1.png)\n\n![again](assets/1.png)\n";
        assert_eq!(image_references(source), vec!["assets/1.png"]);
    }

    #[test]
    fn a_remote_or_inline_image_comes_back_as_written() {
        let source = "![web](https://example.com/x.png)\n\n![data](data:image/png;base64,AAAA)\n";
        assert_eq!(
            image_references(source),
            vec!["https://example.com/x.png", "data:image/png;base64,AAAA"]
        );
    }
}
