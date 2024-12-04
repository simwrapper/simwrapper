// use std::borrow::BorrowMut;
use std::io::{self, BufReader, Cursor, Empty, Read, Result, Seek, SeekFrom, Write};
// use std::thread;

use zstd::Decoder;

use std::thread;
use std::time::Duration;

// Sleep for 500 milliseconds

// use futures::prelude::*;
// use futures::stream::{self, Stream, StreamExt};
// use tokio::time;
// use tokio::time::{interval, Duration};
// const BETWEEN: Duration = Duration::from_secs(1);

use std::sync::mpsc;

static mut FINISHED: bool = false;

pub struct ZstdDecompressor {
    // decoder: Decoder<'static, BufReader<ReceiverReader>>, // tx: mpsc::SyncSender<String>,
    compressed_buffer: Vec<u8>,
    rx: mpsc::Receiver<Vec<u8>>,
}

impl ZstdDecompressor {
    pub fn new(rx: mpsc::Receiver<Vec<u8>>) -> Self {
        // let rx_reader = ReceiverReader::new(rx);

        // let decoder = Decoder::new(rx_reader).expect("NO DECODOR!");
        let compressed_buffer = Vec::new();

        ZstdDecompressor {
            compressed_buffer,
            rx,
        }
    }

    pub fn get_weather_stream(&mut self) -> Option<Vec<u8>> {
        const CHUNK_SIZE: usize = 262144;

        let mut output = Vec::new();

        let mut chunk = Vec::new();

        unsafe {
            if !FINISHED {
                while let Ok(data) = self.rx.try_recv() {
                    chunk.extend_from_slice(&data);
                }
            } else {
                while let Ok(data) = self.rx.recv() {
                    chunk.extend_from_slice(&data);
                }
            }
        }

        // match self.rx.recv() {
        //     Ok(data) => {
        //         chunk.extend_from_slice(&data);
        //     }
        //     Err(e) => {
        //         eprintln!("CLOSING: But error {:?}", e);
        //     }
        // };

        // unsafe {
        //     if !FINISHED {
        //         match self.rx.try_recv() {
        //             Ok(data) => {
        //                 chunk.extend_from_slice(&data);
        //             }
        //             Err(std::sync::mpsc::TryRecvError::Empty) => {
        //                 // No data available right now
        //                 eprintln!("Not finished, but Empty");
        //             }
        //             Err(std::sync::mpsc::TryRecvError::Disconnected) => {
        //                 // Channel is closed
        //                 eprintln!("Channel closed");
        //             }
        //         };
        //     } else {
        //         // blocks! at end.
        //         match self.rx.recv() {
        //             Ok(data) => {
        //                 chunk.extend_from_slice(&data);
        //             }
        //             Err(e) => {
        //                 eprintln!("CLOSING: But error {:?}", e);
        //             }
        //         };
        //     }
        // }

        if chunk.is_empty() {
            return None;
        }

        // we got some data! decompress it
        self.compressed_buffer.extend(chunk);

        // let cursor = Cursor::new(self.compressed_buffer.clone());
        // this AI insanity allows us to manage the cursor
        let mut cursor = Cursor::new(Vec::new());
        *cursor.get_mut() = self.compressed_buffer.clone();
        cursor.set_position(0);
        let mut decoder = Decoder::new(&mut cursor).unwrap();
        let mut buffer = [0; 32768];
        while let Ok(bytes_read) = decoder.read(&mut buffer) {
            if bytes_read == 0 {
                break;
            }
            output.extend_from_slice(&buffer[..bytes_read]);
        }
        // remove consumed bytes from compressed data
        // let pos = decoder.get_ref().stream_position().expect("fleep") as usize;
        let consumed = cursor.position() as usize; // self.compressed_buffer.len() - pos;
        self.compressed_buffer.drain(..consumed);

        // match self.rx.try_recv() {
        //     Ok(chunk) => {
        //         // we got some data! decompress it
        //         self.compressed_buffer.extend(chunk);

        //         // let cursor = Cursor::new(self.compressed_buffer.clone());
        //         // this AI insanity allows us to manage the cursor
        //         let mut cursor = Cursor::new(Vec::new());
        //         *cursor.get_mut() = self.compressed_buffer.clone();
        //         cursor.set_position(0);
        //         let mut decoder = Decoder::new(&mut cursor).unwrap();
        //         let mut buffer = [0; 4096];
        //         while let Ok(bytes_read) = decoder.read(&mut buffer) {
        //             if bytes_read == 0 {
        //                 break;
        //             }
        //             output.extend_from_slice(&buffer[..bytes_read]);
        //         }
        //         // remove consumed bytes from compressed data
        //         // let pos = decoder.get_ref().stream_position().expect("fleep") as usize;
        //         let consumed = cursor.position() as usize; // self.compressed_buffer.len() - pos;
        //         self.compressed_buffer.drain(..consumed);
        //     }
        //     Err(std::sync::mpsc::TryRecvError::Empty) => {
        //         // No data available right now
        //         eprintln!("No data ready");
        //     }
        //     Err(std::sync::mpsc::TryRecvError::Disconnected) => {
        //         // Channel is closed
        //         eprintln!("Channel closed");
        //     }
        // }

        if !output.is_empty() {
            Some(output)
        } else {
            None
        }

        // match self.rx.try_recv() {
        //     Ok(data) => Some("hello".as_bytes().to_vec()), // Some(data),
        //     Err(std::sync::mpsc::TryRecvError::Empty) => {
        //         // No data available right now
        //         println!("No data ready");
        //         None
        //     }
        //     Err(std::sync::mpsc::TryRecvError::Disconnected) => {
        //         // Channel is closed
        //         println!("Channel closed");
        //         None
        //     }
        // }
    }
}

fn main() {
    use std::env;
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("Need .ZST filename");
        return;
    }
    // read file
    let compressed = std::fs::read(&args[1]).expect("----Could not read file");

    // divide file into chunks to pass to dechunker
    let chunk_size = 20000;

    let chunks = compressed.as_slice().chunks(chunk_size);
    eprintln!("\n----File split into {} chunks", chunks.len());

    // create comm channel and ZDecoder
    let (tx, rx) = mpsc::channel(); // sync_channel(32768);
    let mut zboot = ZstdDecompressor::new(rx);

    // let mut streamer = EventStreamer::new();

    for chunk in chunks {
        let mut data = Vec::new();
        data.extend_from_slice(chunk);
        tx.send(data).expect("nope5");

        match zboot.get_weather_stream() {
            Some(partial_result) => {
                print!("{}", String::from_utf8_lossy(&partial_result));
            }
            None => {
                eprintln!("...not yet...");
            }
        }
    }

    // tx.send(String::from("String 1\n")).expect("nope1");
    // tx.send(String::from("String 2\n")).expect("nope2");

    unsafe {
        FINISHED = true;
    }

    drop(tx);

    // loop {
    match zboot.get_weather_stream() {
        Some(final_result) => {
            print!("{}", String::from_utf8_lossy(&final_result));
        }
        None => {
            eprintln!("still waiting to finish");
            thread::sleep(Duration::from_millis(500));
        }
    }
    // }
}

struct ReceiverReader {
    rx: mpsc::Receiver<Vec<u8>>,
    current_chunk: Option<Vec<u8>>,
    current_pos: usize,
}

impl ReceiverReader {
    pub fn new(rx: mpsc::Receiver<Vec<u8>>) -> Self {
        Self {
            rx,
            current_chunk: None,
            current_pos: 0,
        }
    }
}

impl Read for ReceiverReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let mut total_read = 0;

        while total_read < buf.len() {
            // If no current chunk or we've read it fully, fetch the next one
            if self.current_chunk.is_none()
                || self.current_pos >= self.current_chunk.as_ref().unwrap().len()
            {
                unsafe {
                    // if !FINISHED {
                    //     self.current_chunk = self.rx.try_recv().ok();
                    //     self.current_pos = 0;
                    // } else {
                    // this blocks! end of data.
                    self.current_chunk = self.rx.recv().ok();
                    self.current_pos = 0;
                    // }
                }

                // If no more data is available, break.
                if self.current_chunk.is_none() {
                    break;
                }
            }

            // Copy data from the current chunk to the buffer
            let chunk = self.current_chunk.as_ref().unwrap();
            let bytes_to_read =
                std::cmp::min(buf.len() - total_read, chunk.len() - self.current_pos);
            buf[total_read..total_read + bytes_to_read]
                .copy_from_slice(&chunk[self.current_pos..self.current_pos + bytes_to_read]);

            self.current_pos += bytes_to_read;
            total_read += bytes_to_read;
        }

        Ok(total_read)
    }
}
