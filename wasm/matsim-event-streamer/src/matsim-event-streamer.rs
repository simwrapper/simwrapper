// use std::borrow::BorrowMut;
// use std::io::{self, BufReader, Cursor, Empty, Read, Result, Seek, SeekFrom, Write};
// use std::thread;
use zstd::Decoder;

// use futures::prelude::*;
// use futures::stream::{self, Stream, StreamExt};
// use tokio::time;
// use tokio::time::{interval, Duration};
// const BETWEEN: Duration = Duration::from_secs(1);

use std::sync::mpsc;

pub struct ZstdDecompressor {
    rx: mpsc::Receiver<Vec<u8>>,
    // tx: mpsc::SyncSender<String>,
}

impl ZstdDecompressor {
    pub fn new(rx: mpsc::Receiver<Vec<u8>>) -> Self {
        ZstdDecompressor { rx }
    }

    pub fn get_weather_stream(&mut self) -> Option<Vec<u8>> {
        match self.rx.try_recv() {
            Ok(data) => Some("hello".as_bytes().to_vec()), // Some(data),
            Err(std::sync::mpsc::TryRecvError::Empty) => {
                // No data available right now
                println!("No data ready");
                None
            }
            Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                // Channel is closed
                println!("Channel closed");
                None
            }
        }
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
    let chunk_size = 10000;

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

        match zboot.get_weather_stream() {
            Some(partial_result) => {
                println!("IN MAIN: {}", String::from_utf8_lossy(&partial_result));
            }
            None => {
                println!("...not yet...");
            }
        }
    }

    // tx.send(String::from("String 1\n")).expect("nope1");
    // tx.send(String::from("String 2\n")).expect("nope2");
    drop(tx);

    while let Some(result) = zboot.get_weather_stream() {
        println!("FINAL: {}", String::from_utf8_lossy(&result));
    }
}
