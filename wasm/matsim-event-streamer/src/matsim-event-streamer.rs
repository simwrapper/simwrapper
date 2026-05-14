use wasm_bindgen::prelude::*;

use std::borrow::BorrowMut;
use std::ptr;

use libz_rs_sys::z_stream;
use zlib_rs::ReturnCode;

// ---------------------------------------------------------------------------
// Trait: StreamDecompressor
// ---------------------------------------------------------------------------
// Both gzip and zstd implement this. Contract:
//   - `decompress` accepts an arbitrary chunk of compressed bytes
//     (boundaries are NOT aligned to any frame/block structure).
//   - Returns the decompressed bytes produced from that chunk.
//   - The implementation handles internal buffering as needed.
// ---------------------------------------------------------------------------

trait StreamDecompressor {
    fn decompress(&mut self, input: &[u8]) -> Result<Vec<u8>, String>;
    fn is_finished(&self) -> bool;
}

// ---------------------------------------------------------------------------
// Gzip decompressor  (libz-rs-sys — your existing logic, cleaned up)
// ---------------------------------------------------------------------------

struct GzipDecompressor {
    stream: z_stream,
    total_out_before: u64,
    finished: bool,
}

impl GzipDecompressor {
    fn new() -> Self {
        let mut stream = z_stream::default();
        let window_bits: i32 = 16 + 15; // gzip wrapper

        unsafe {
            let err = libz_rs_sys::inflateInit2_(
                &mut stream,
                window_bits,
                libz_rs_sys::zlibVersion(),
                core::mem::size_of::<z_stream>() as i32,
            );
            let rc = ReturnCode::from(err);
            assert_eq!(ReturnCode::Ok, rc, "inflateInit2_ failed");
        }

        GzipDecompressor {
            stream,
            total_out_before: 0,
            finished: false,
        }
    }
}

impl StreamDecompressor for GzipDecompressor {
    fn decompress(&mut self, input: &[u8]) -> Result<Vec<u8>, String> {
        if self.finished {
            return Ok(Vec::new());
        }

        self.stream.next_in = input.as_ptr() as *mut u8;
        self.stream.avail_in = input.len() as _;

        // Fast path: one inflate call. For 64 KiB inputs (the size process()
        // hands us) the output always fits in 2.5 MB, so this is the only
        // path taken. Returns the buffer directly — no extra copy.
        let mut output = vec![0u8; 2_500_000];
        self.stream.next_out = output.as_mut_ptr();
        self.stream.avail_out = output.len() as _;

        let err = unsafe {
            let p = ptr::from_mut(self.stream.borrow_mut());
            libz_rs_sys::inflate(p, libz_rs_sys::Z_NO_FLUSH)
        };
        let rc = ReturnCode::from(err);

        let total_out = self.stream.total_out as u64;
        let produced = (total_out - self.total_out_before) as usize;
        self.total_out_before = total_out;
        output.truncate(produced);

        match rc {
            ReturnCode::StreamEnd => {
                self.finished = true;
                unsafe {
                    let p = ptr::from_mut(self.stream.borrow_mut());
                    let end_err = libz_rs_sys::inflateEnd(p);
                    let end_rc = ReturnCode::from(end_err);
                    assert_eq!(ReturnCode::Ok, end_rc, "inflateEnd failed");
                }
                return Ok(output);
            }
            ReturnCode::Ok => {
                if self.stream.avail_in == 0 {
                    return Ok(output);
                }
                // Slow path: input larger than 2.5 MB decompresses to — keep
                // looping with fresh buffers and accumulate. Should never
                // happen with the 64 KiB sub-chunking in process(), but kept
                // as a safety net.
                let mut all_output = output;
                loop {
                    let mut more = vec![0u8; 2_500_000];
                    self.stream.next_out = more.as_mut_ptr();
                    self.stream.avail_out = more.len() as _;

                    let err = unsafe {
                        let p = ptr::from_mut(self.stream.borrow_mut());
                        libz_rs_sys::inflate(p, libz_rs_sys::Z_NO_FLUSH)
                    };
                    let rc = ReturnCode::from(err);

                    let total_out = self.stream.total_out as u64;
                    let produced = (total_out - self.total_out_before) as usize;
                    self.total_out_before = total_out;
                    more.truncate(produced);
                    all_output.append(&mut more);

                    match rc {
                        ReturnCode::StreamEnd => {
                            self.finished = true;
                            unsafe {
                                let p = ptr::from_mut(self.stream.borrow_mut());
                                let end_err = libz_rs_sys::inflateEnd(p);
                                let end_rc = ReturnCode::from(end_err);
                                assert_eq!(ReturnCode::Ok, end_rc, "inflateEnd failed");
                            }
                            return Ok(all_output);
                        }
                        ReturnCode::Ok => {
                            if self.stream.avail_in == 0 {
                                return Ok(all_output);
                            }
                            if produced == 0 {
                                return Err("gzip inflate: no progress".to_string());
                            }
                        }
                        _ => {
                            return Err(format!("gzip inflate error {:?}", rc));
                        }
                    }
                }
            }
            _ => {
                let msg = if self.stream.msg.is_null() {
                    "<no error message>".to_string()
                } else {
                    unsafe { std::ffi::CStr::from_ptr(self.stream.msg) }
                        .to_string_lossy()
                        .into_owned()
                };
                Err(format!("gzip inflate error {:?}: {}", rc, msg))
            }
        }
    }

    fn is_finished(&self) -> bool {
        self.finished
    }
}

// ---------------------------------------------------------------------------
// Zstd decompressor  (ruzstd — pure-Rust, push-style via decode_from_to)
// ---------------------------------------------------------------------------
// FrameDecoder::decode_from_to is a push-style API: it decodes whatever full
// blocks are present in the source slice and tells us how many bytes it
// consumed. If the source doesn't yet contain a full block, it returns
// `read == 0` and we keep the bytes for the next call. Max zstd block size
// is 128 KiB, so `pending` never grows beyond ~128 KiB + frame-header slack.
// ---------------------------------------------------------------------------

use ruzstd::FrameDecoder;

const ZSTD_OUTPUT_BUF_BYTES: usize = 256 * 1024;

struct ZstdDecompressor {
    decoder: FrameDecoder,
    pending: Vec<u8>,
    finished: bool,
}

impl ZstdDecompressor {
    fn new() -> Self {
        ZstdDecompressor {
            decoder: FrameDecoder::new(),
            pending: Vec::new(),
            finished: false,
        }
    }
}

impl StreamDecompressor for ZstdDecompressor {
    fn decompress(&mut self, input: &[u8]) -> Result<Vec<u8>, String> {
        if self.finished {
            return Ok(Vec::new());
        }

        self.pending.extend_from_slice(input);

        let mut output: Vec<u8> = Vec::new();
        let mut target = vec![0u8; ZSTD_OUTPUT_BUF_BYTES];

        loop {
            let (read, written) = self
                .decoder
                .decode_from_to(&self.pending, &mut target)
                .map_err(|e| format!("zstd decode error: {:?}", e))?;

            if written > 0 {
                output.extend_from_slice(&target[..written]);
            }
            if read > 0 {
                self.pending.drain(..read);
            }

            if read == 0 && written == 0 {
                break;
            }
        }

        if self.decoder.is_finished() && self.decoder.can_collect() == 0 {
            self.finished = true;
            self.pending.clear();
            self.pending.shrink_to_fit();
        }

        Ok(output)
    }

    fn is_finished(&self) -> bool {
        self.finished
    }
}

// ---------------------------------------------------------------------------
// EventStreamer  (the WASM-exported struct)
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub struct EventStreamer {
    total_bytes_so_far: u32,
    num_chunks: u32,
    leftovers: Vec<u8>,
    decompressor: Box<dyn StreamDecompressor>,
}

#[wasm_bindgen]
impl EventStreamer {
    #[wasm_bindgen(constructor)]
    pub fn new(compression: &str) -> EventStreamer {
        #[cfg(target_arch = "wasm32")]
        console_error_panic_hook::set_once();

        let decompressor: Box<dyn StreamDecompressor> = match compression {
            "zstd" => Box::new(ZstdDecompressor::new()),
            _ => Box::new(GzipDecompressor::new()),
        };

        EventStreamer {
            num_chunks: 0,
            total_bytes_so_far: 0,
            leftovers: Vec::new(),
            decompressor,
        }
    }

    pub fn process(&mut self, chunk: Vec<u8>) -> String {
        // Split incoming chunk into 64 KiB pieces and process each through the
        // decompressor + XML→JSON pipeline. Matches the original algorithm:
        // small inputs let the gzip backend do a single inflate() per call
        // (no retry loop, no extra output copies), and bound the per-call
        // working set so the WASM allocator stays in a hot reuse pattern.
        let sub_chunk_size = 65536;
        let mut all_json = String::from("[\n");

        for sub_chunk in chunk.as_slice().chunks(sub_chunk_size) {
            self.num_chunks += 1;

            let data = self
                .decompressor
                .decompress(sub_chunk)
                .expect("decompression failed");

            self.total_bytes_so_far += data.len() as u32;

            let (json_rows, fragment) = self.convert_to_json(data);
            self.leftovers = fragment;
            all_json += &json_rows;
        }

        if all_json.ends_with(",\n") {
            all_json.truncate(all_json.len() - 2);
        }
        all_json += "\n]";

        all_json
    }

    // -----------------------------------------------------------------------
    // XML → JSON conversion  (unchanged logic from your original)
    // -----------------------------------------------------------------------
    fn convert_to_json(&self, xml: Vec<u8>) -> (String, Vec<u8>) {
        let mut fragment: Vec<u8> = Vec::new();
        let mut json_rows = Vec::new();

        // merge previous chunk's leftovers with this new data
        let mut full_buffer: Vec<u8> = Vec::new();
        full_buffer.extend_from_slice(&self.leftovers);
        full_buffer.extend_from_slice(&xml);

        // partial line after the last newline gets pushed to next chunk
        let limit = full_buffer
            .iter()
            .rposition(|&b| b == b'\n')
            .unwrap_or(full_buffer.len());

        if limit < full_buffer.len() {
            fragment.extend_from_slice(&full_buffer[limit + 1..]);
        }
        let valid_row_text = &full_buffer[..limit];

        // split into event rows and clean up
        let event_rows: Vec<&[u8]> = valid_row_text
            .split(|&b| b == b'\n')
            .map(|row| row.trim_ascii())
            .filter(|x| x.starts_with(b"<event "))
            .collect();

        for raw_event in event_rows {
            let xml_line = String::from_utf8_lossy(raw_event);
            let doc = roxmltree::Document::parse(&xml_line).expect("bad line");

            let mut event = String::from("{");
            doc.root_element().attributes().for_each(|attr| {
                let name = attr.name().to_string();
                let mut value = attr.value().to_string();
                value = value.replace(r#"""#, r#"\""#);

                if name == "time" {
                    let num_val = value.parse::<f64>().expect("bad time value");
                    event += &format!("\"{}\":{},", name, num_val);
                } else {
                    event += &format!("\"{}\":\"{}\",", name, value);
                }
            });
            event.truncate(event.len() - 1);
            event += "}";
            json_rows.push(event);
        }

        let mut chunk_json = json_rows.join(",\n");
        if !chunk_json.is_empty() {
            chunk_json += ",\n";
        }

        (chunk_json, fragment)
    }
}

// ---------------------------------------------------------------------------
// CLI test harness  (not compiled for WASM)
// ---------------------------------------------------------------------------
#[cfg(not(target_arch = "wasm32"))]
fn main() {
    use std::env;

    let args: Vec<String> = env::args().collect();

    if args.len() < 2 || args.len() > 3 {
        println!("Usage: event_streamer <filename> [gzip|zstd]");
        return;
    }

    let filename = &args[1];
    let compression = if args.len() == 3 { &args[2] } else { "gzip" };

    let data = std::fs::read(filename).expect("Could not read file");
    let chunk_size = 140000;

    let mut streamer = EventStreamer::new(compression);

    for chunk in data.chunks(chunk_size) {
        let json = streamer.process(chunk.to_vec());
        println!("{json}");
    }
}
