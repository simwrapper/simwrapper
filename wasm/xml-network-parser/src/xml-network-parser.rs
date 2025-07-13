use quickxml_to_serde::{xml_string_to_json, Config, JsonArray, JsonType, NullValue};

use wasm_bindgen::prelude::*;
#[wasm_bindgen]
pub struct XmlToJson {
    config: Config,
}

#[wasm_bindgen]
impl XmlToJson {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        XmlToJson {
            config: Config::new_with_custom_values(true, "$", "text", NullValue::Null)
                .add_json_type_override("/r/node", JsonArray::Always(JsonType::Infer))
                .add_json_type_override("/r/link", JsonArray::Always(JsonType::Infer))
                .add_json_type_override("/r/node/@id", JsonArray::Infer(JsonType::AlwaysString))
                .add_json_type_override("/r/link/@id", JsonArray::Infer(JsonType::AlwaysString))
                .add_json_type_override("/r/link/@to", JsonArray::Infer(JsonType::AlwaysString))
                .add_json_type_override("/r/link/@from", JsonArray::Infer(JsonType::AlwaysString)),
        }
    }

    pub fn parse(&mut self, xml: &str) -> String {
        // let fullXml = format!("<root>{}</root>", xml);
        let json = xml_string_to_json(xml.to_owned(), &self.config);
        json.expect("Malformed XML").to_string()
    }
}

fn main() {
    use std::env;

    let args: Vec<String> = env::args().collect();

    if args.len() != 2 {
        println!("Need XML filename");
        return;
    }

    // read file
    let filename = &args[1];
    let bytes = std::fs::read(&filename).unwrap();
    let text = String::from_utf8_lossy(&bytes);

    // begin parsing
    let mut parser = XmlToJson::new();
    let json = parser.parse(&text);

    println!("{:?}", json)
}
