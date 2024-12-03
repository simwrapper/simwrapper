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

pub struct ZstdDecompressor {
    decoder: Decoder<'static, BufReader<ReceiverReader>>, // tx: mpsc::SyncSender<String>,
    finished: bool,
}

impl ZstdDecompressor {
    pub fn new(rx: mpsc::Receiver<Vec<u8>>) -> Self {
        let rx_reader = ReceiverReader::new(rx);
        let decoder = Decoder::new(rx_reader).expect("NO DECODOR!");

        ZstdDecompressor {
            decoder,
            finished: false,
        }
    }

    pub fn get_weather_stream(&mut self, finished: bool) -> Option<Vec<Vec<u8>>> {
        const CHUNK_SIZE: usize = 65536;

        let mut result_nuggets = Vec::new();
        let mut buffer = vec![0; CHUNK_SIZE];

        loop {
            match self.decoder.read(&mut buffer) {
                Ok(0) => break, // End of stream
                Ok(n) => {
                    let mut nugget = Vec::new();
                    nugget.extend_from_slice(&buffer[..n]);
                    result_nuggets.push(nugget);
                }
                Err(e) => {
                    eprint!("2bad noez! {:?}", e);
                    break;
                }
            }
        }

        if !result_nuggets.is_empty() {
            Some(result_nuggets)
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
        println!("Need .ZST filename");
        return;
    }
    // read file
    let compressed = std::fs::read(&args[1]).expect("----Could not read file");

    // divide file into chunks to pass to dechunker
    let chunk_size = 50000;

    let chunks = compressed.as_slice().chunks(chunk_size);
    println!("\n----File split into {} chunks", chunks.len());

    // create comm channel and ZDecoder
    let (tx, rx) = mpsc::sync_channel(32768);
    let mut zboot = ZstdDecompressor::new(rx);

    // let mut streamer = EventStreamer::new();

    for chunk in chunks {
        let mut data = Vec::new();
        data.extend_from_slice(chunk);
        tx.send(data).expect("nope5");

        match zboot.get_weather_stream(false) {
            Some(partial_result) => {
                for nugget in partial_result {
                    print!("{}", String::from_utf8_lossy(&nugget));
                }
            }
            None => {
                println!("...not yet...");
            }
        }
    }

    // tx.send(String::from("String 1\n")).expect("nope1");
    // tx.send(String::from("String 2\n")).expect("nope2");
    drop(tx);
    zboot.finished = true;

    loop {
        match zboot.get_weather_stream(true) {
            Some(final_result) => {
                for nugget in final_result {
                    print!("{}", String::from_utf8_lossy(&nugget));
                }
            }
            None => {
                println!("still waiting to finish");
                thread::sleep(Duration::from_millis(100));
            }
        }
    }
}

struct ReceiverReader {
    rx: mpsc::Receiver<Vec<u8>>,
    current_chunk: Option<Vec<u8>>,
    current_pos: usize,
    finished: bool,
}

impl ReceiverReader {
    pub fn new(rx: mpsc::Receiver<Vec<u8>>) -> Self {
        Self {
            rx,
            current_chunk: None,
            current_pos: 0,
            finished: false,
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
                if !self.finished {
                    self.current_chunk = self.rx.try_recv().ok();
                    self.current_pos = 0;
                } else {
                    // this blocks! end of data.
                    self.current_chunk = self.rx.recv().ok();
                    self.current_pos = 0;
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
