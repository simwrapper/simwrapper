use wasm_bindgen::prelude::*;

use std::ptr;
use std::fs;
use std::{ffi::c_ulong, path::PathBuf};
use std::io::{BufReader, BufRead, Read};

use flate2::read::GzDecoder;

use quick_xml::de::from_str;
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Debug, Serialize, Deserialize)]
struct Network {
    attributes: Option<Attributes>,
    nodes: Nodes,
    links: Links,
}

#[derive(Debug, Serialize, Deserialize)]
struct Attributes {
    attribute: Attribute,
}

#[derive(Debug, Serialize, Deserialize)]
struct Attribute {
    #[serde(rename = "@name")]
    name: String,
    #[serde(rename = "@class")]
    class: String,
    #[serde(rename = "$value")]
    value: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Nodes {
    node: Vec<Node>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Node {
    #[serde(rename = "@id")]
    id: String,
    #[serde(rename = "@x")]
    x: f64,
    #[serde(rename = "@y")]
    y: f64,
}

#[derive(Debug, Serialize, Deserialize)]
struct Links {
    #[serde(rename = "@capperiod")]
    capperiod: String,
    #[serde(rename = "@effectivecellsize")]
    effectivecellsize: f64,
    #[serde(rename = "@effectivelanewidth")]
    effectivelanewidth: f64,
    link: Vec<Link>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Link {
    #[serde(rename = "@id")]
    id: String,
    #[serde(rename = "@from")]
    from: String,
    #[serde(rename = "@to")]
    to: String,
    #[serde(rename = "@length")]
    length: f64,
    #[serde(rename = "@freespeed")]
    freespeed: f64,
    #[serde(rename = "@capacity")]
    capacity: f64,
    #[serde(rename = "@permlanes")]
    permlanes: f64,
    #[serde(rename = "@oneway")]
    oneway: u8,
    #[serde(rename = "@modes")]
    modes: String,

    // Optional field
    #[serde(rename = "@origid")]
    origid: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ColumnarNodes {
    id: Vec<String>,
    x: Vec<f64>,
    y: Vec<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ColumnarLinks {
    id: Vec<String>,
    from: Vec<String>,
    to: Vec<String>,
    length: Vec<f64>,
    freespeed: Vec<f64>,
    capacity: Vec<f64>,
    permlanes: Vec<f64>,
    oneway: Vec<u8>,
    modes: Vec<String>,
    origid: Vec<Option<String>>,
}

#[wasm_bindgen]
pub struct XmlNetworkParser {
    content: Vec<u8>,
}

#[wasm_bindgen]
impl XmlNetworkParser {
    // ----CONSTRUCTOR !! ------------
    #[wasm_bindgen(constructor)]
    pub fn new() -> XmlNetworkParser {
        XmlNetworkParser {
            content: Vec::new(),
        }
    }

    pub fn process(&mut self, compressed: Vec<u8>) -> String {
      let mut decoder = GzDecoder::new(&compressed[..]);
      let reader = BufReader::new(decoder);
      let mut xml = Vec::new();

      let mut i:f64 =0.0;

      for line in reader.lines() {
          i += 1.0;
      }

      println!("{:?}", i);

    //   decoder.read_to_end(&mut xml).expect("faield reading");

      println!("{:?} uncompressed bytes", xml.len());

      let network: Network = from_str(&String::from_utf8_lossy(&xml)).unwrap();

      // Restructure nodes into arrays
      let node_arrays = ColumnarNodes {
          id: network.nodes.node.iter().map(|n| n.id.clone()).collect(),
          x: network.nodes.node.iter().map(|n| n.x).collect(),
          y: network.nodes.node.iter().map(|n| n.y).collect(),
      };

      let link_arrays = ColumnarLinks {
          id: network.links.link.iter().map(|l| l.id.clone()).collect(),
          from: network.links.link.iter().map(|l| l.from.clone()).collect(),
          to: network.links.link.iter().map(|l| l.to.clone()).collect(),
          length: network.links.link.iter().map(|l| l.length  ).collect(),
          freespeed: network.links.link.iter().map(|l| l.freespeed).collect(),
          capacity: network.links.link.iter().map(|l| l.capacity).collect(),
          permlanes: network.links.link.iter().map(|l| l.permlanes).collect(),
          oneway: network.links.link.iter().map(|l| l.oneway  ).collect(),
          modes: network.links.link.iter().map(|l| l.modes.clone()).collect(),
          origid: network.links.link.iter().map(|l| l.origid.clone()).collect(),
        };

      let fulljson = serde_json::json!({
          "nodes": node_arrays,
          "links": link_arrays,
      });

      let prettyjson = serde_json::to_string_pretty(&fulljson).unwrap();
      prettyjson
    }
}

    // pub fn process(&mut self, deflated: Vec<u8>) -> String {
    //     // // divide file into sections (mini-chunks!) to pass to dechunker.
    //     let chunk_size = 65536;
    //     let chunks = deflated.as_slice().chunks(chunk_size);

    //     let mut all_json = String::from("[\n");

    //     for chunk in chunks {
    //         self.num_chunks += 1;
    //         // decompress each chunk
    //         let data = self.decompress_chunk(chunk);

    //         // keep track of how much we've received
    //         self.total_bytes_so_far += data.len() as u32;

    //         // convert to json
    //         let (json_rows, fragment) = self.convert_to_json(data);

    //         self.leftovers = fragment;

    //         // println!("----Writing");
    //         // // out_file.write(&data).expect("Could not write contents");
    //         // println!("{}", &json_rows);

    //         all_json += &json_rows;
    //     }
    //     // close the JSON array notation
    //     all_json.truncate(all_json.len() - 2);
    //     all_json += "\n]";

    //     all_json
    // }

    // fn decompress_chunk(&mut self, chunk: &[u8]) -> Vec<u8> {
    //     // this is based based on zlib-rs crate --> fuzz/fuzz_targets/inflate_chunked.rs

    //     // WOW santiago had some massive compression due to extremely long and
    //     // repetitive transit line stop lists
    //     let mut output = vec![0; 2_500_000];

    //     self.dechunker.next_in = chunk.as_ptr() as *mut u8;
    //     self.dechunker.avail_in = chunk.len() as _;
    //     self.dechunker.next_out = output.as_mut_ptr();
    //     self.dechunker.avail_out = output.len() as _;

    //     // ------------------------
    //     let err = unsafe {
    //         let decompressor = ptr::from_mut(self.dechunker.borrow_mut());
    //         libz_rs_sys::inflate(decompressor, ::libz_rs_sys::Z_NO_FLUSH)
    //     };
    //     let return_code: ReturnCode = ReturnCode::from(err);

    //     match return_code {
    //         ReturnCode::Ok => {
    //             let num_bytes_this_result = self.dechunker.total_out - self.total_bytes_so_far;

    //             output.truncate(num_bytes_this_result.try_into().unwrap());
    //             // print!("\r---- {} {} {}     ", self.num_chunks, num_bytes_this_result, self.dechunker.total_out);
    //         }
    //         ReturnCode::StreamEnd => {
    //             // END: de-allocating all the libz unsafe stuff
    //             let num_bytes_this_result = self.dechunker.total_out - self.total_bytes_so_far;

    //             output.truncate(num_bytes_this_result.try_into().unwrap());
    //             // print!("\r---- {} {} {}     ", self.num_chunks, num_bytes_this_result, self.dechunker.total_out);
    //             // println!("\n----WE ARE AT THE END----");

    //             unsafe {
    //                 let decompressor = ptr::from_mut(self.dechunker.borrow_mut());
    //                 let err = libz_rs_sys::inflateEnd(decompressor);
    //                 let return_code: ReturnCode = ReturnCode::from(err);
    //                 assert_eq!(ReturnCode::Ok, return_code);
    //             }
    //         }
    //         _ => {
    //             // ALL ERROR CONDITIONS: PANIC!
    //             if self.dechunker.msg.is_null() {
    //                 panic!(
    //                     "CHUNK {}: {:?}: <no error message>",
    //                     self.num_chunks, return_code
    //                 )
    //             } else {
    //                 let msg = unsafe { std::ffi::CStr::from_ptr(self.dechunker.msg) };
    //                 panic!("CHUNK {}: {:?}: {:?}", self.num_chunks, return_code, msg)
    //             }
    //         }
    //     };

    //     output
    // }

    // -------------------------------------
//     fn convert_to_json(&self, xml: Vec<u8>) -> (String, Vec<u8>) {
//         let mut fragment: Vec<u8> = Vec::new();
//         let mut json_rows = Vec::new();

//         // merge the previous chunk's leftovers with this new data
//         let mut full_buffer: Vec<u8> = Vec::new();
//         full_buffer.extend_from_slice(&self.leftovers);
//         full_buffer.extend_from_slice(&xml);

//         // any partial broken line after the last newline gets pushed to next chunk
//         let limit;
//         match full_buffer.iter().rposition(|&b| b == b'\n') {
//             Some(idx) => limit = idx,
//             _ => limit = full_buffer.len(),
//         }
//         // divide the valid rows from the last-line leftovers
//         if limit < full_buffer.len() {
//             fragment.extend_from_slice(&full_buffer[limit + 1..])
//         };
//         let mut valid_row_text = Vec::new();
//         valid_row_text.extend_from_slice(&full_buffer[..limit]);

//         // split into event rows and clean up the edges
//         let event_rows: Vec<&[u8]> = valid_row_text
//             .split(|&b| b == b'\n')
//             .map(|row| row.trim_ascii())
//             .filter(|x| x.starts_with(b"<event "))
//             .collect();

//         // let mut combined = String::new();

//         // loop over the <event... /> text rows
//         for raw_event in event_rows {
//             let xml_line = String::from_utf8_lossy(raw_event);

//             let doc = roxmltree::Document::parse(&xml_line).expect("bad line");

//             let mut event = String::from("{");
//             doc.root_element().attributes().for_each(|attr| {
//                 let name = attr.name().to_string();
//                 let mut value = attr.value().to_string();
//                 // fix quotes
//                 value = value.replace(r#"""#, r#"\""#); // not sure why but &quot; => " and we make " -> \"
//                                                         // parse time
//                 if name == "time" {
//                     let num_val = value.parse::<f64>().expect("nope");
//                     event += &format!("\"{}\":{},", name, num_val);
//                 } else {
//                     event += &format!("\"{}\":\"{}\",", name, value);
//                 }
//             });
//             event.truncate(event.len() - 1);
//             event += "}";
//             json_rows.push(event);

//             // // map all k,v attributes and join them as strings
//             // let mut map = IndexMap::new();

//             // // fix times to float
//             // let time = String::from("time");
//             // if let Some(Value::String(v)) = map.get(&time) {
//             //     let fvalue= v.parse::<f64>().unwrap();
//             //     let number = Number::from_f64(fvalue).expect("no");
//             //     map.insert(time, Value::Number(number));
//             // }
//         }

//         let mut chunk_json_rows_with_commas = json_rows.join(",\n");
//         // last row NEEDS a comma, we'll chop the finalfinal comma after all chunks have arrived
//         chunk_json_rows_with_commas += ",\n";

//         (chunk_json_rows_with_commas, fragment)
//     }
// }

// fn init_dechunker() -> z_stream {
//     let mut stream = libz_rs_sys::z_stream::default();

//     // initial the stream for chunking (that's the 16+15)
//     let window_bits = 16 + 15; // the one true answer

//     // this is based on zlib-rs crate --> fuzz/fuzz_targets/inflate_chunked.rs
//     unsafe {
//         let err = libz_rs_sys::inflateInit2_(
//             &mut stream,
//             window_bits as i32,
//             libz_rs_sys::zlibVersion(),
//             core::mem::size_of::<libz_rs_sys::z_stream>() as i32,
//         );
//         let return_code: ReturnCode = ReturnCode::from(err);
//         assert_eq!(ReturnCode::Ok, return_code);
//     };
//     // return the initialized stream
//     stream
// }

fn main() {
    use std::env;

    let args: Vec<String> = env::args().collect();

    if args.len() != 2 {
        println!("Need XML.GZ filename");
        return;
    }

    // read file
    let filename = &args[1];
    let gzbytes = std::fs::read(&filename).unwrap();

    let mut parser = XmlNetworkParser::new();
    let prettyjson = parser.process(gzbytes);

    // open output file for writing
    let output_filename = "output.json";
    let path = PathBuf::from(output_filename);
    std::fs::write(path, &prettyjson).unwrap();
}
