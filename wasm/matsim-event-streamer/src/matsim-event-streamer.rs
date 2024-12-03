// use std::borrow::BorrowMut;
use std::io::{Cursor, Empty, Read, Result, Seek, SeekFrom, Write};
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

use tokio::sync::mpsc;

use async_compression::tokio::bufread::ZstdDecoder;
use tokio::io::{self, AsyncBufReadExt, AsyncReadExt, BufReader, Error};
use tokio::net::TcpStream;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::{Stream, StreamExt};
use tokio_util::io::StreamReader;

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
}

/// Asynchronous function that decompresses a stream of compressed chunks and yields each decompressed text chunk
async fn decompress_zstd<R>(
    mut decoder: ZstdDecoder<BufReader<StreamReader<R, io::Error>>>,
) -> impl Stream<Item = String>
where
    R: Stream<Item = Result<Vec<u8>>> + Unpin,
{
    let mut buffer = vec![0; 8192]; // Buffer for decompressed data

    async_stream::stream! {
            loop {
                // Read decompressed data into the buffer
                let bytes_read = 0; // decoder.read(&mut buffer).await.unwrap();

                if bytes_read == 0 {
                    // End of stream
                        break;
                }

                // Process the decompressed data (convert to String and yield it)
                let text = String::from_utf8_lossy(&buffer[..bytes_read]);  // (&buffer[..bytes_read])
                yield text.to_string();
        }
    }
}

#[tokio::main]
async fn main() {
    use std::env;
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("Need .ZST filename");
        // return;
    }
    // read file
    let compressed = std::fs::read(&args[1]).expect("----Could not read file");

    // divide file into chunks to pass to dechunker
    let chunk_size = 20000;

    let chunks = compressed.as_slice().chunks(chunk_size);
    eprintln!("\n----File split into {} chunks", chunks.len());

    // for chunk in chunks {
    //     let mut data = Vec::new();
    //     data.extend_from_slice(chunk);
    //     tx.send(data).await.expect("zzz");
    // }

    let compressed_stream = tokio_stream::iter(chunks);

    // Wrap the stream into a StreamReader
    let stream_reader = StreamReader::new(compressed_stream.map(|chunk| Ok::<_, io::Error>(chunk)));

    // Wrap the StreamReader with a BufReader for buffered reading
    let reader = BufReader::new(stream_reader);

    // Wrap the BufReader with a ZstdDecoder
    let mut decoder = ZstdDecoder::new(reader);

    // Buffer to hold decompressed data
    let mut buffer = vec![0; 8192];

    // // Yield decompressed data as we get it
    // let mut yield_stream = async_stream::stream! {
    loop {
        let bytes_read = decoder.read(&mut buffer).await.expect("Tasasdf");

        if bytes_read == 0 {
            // End of stream
            break;
        }

        // Process the decompressed data (for example, print it as a string)
        if let Ok(text) = std::str::from_utf8(&buffer[..bytes_read]) {
            print!("{}", text);
        }
    }
    // };

    // while let Some(ztext) = yield_stream.next().await {
    //     print!("{}", ztext)
    // }
}
