use futures::stream::StreamExt;
use std::io::{self, Read};
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::Stream;
use zstd::Decompressor;

/// An asynchronous Zstandard decoder that can work with MPSC channels
pub struct AsyncZstdDecoder {
    decompressor: Decompressor<'static>,
    buffer: Vec<u8>,
    input_buffer: Vec<u8>,
    eof: bool,
}

impl AsyncZstdDecoder {
    /// Create a new AsyncZstdDecoder with optional dictionary
    pub fn new(dictionary: Option<&[u8]>) -> Result<Self, io::Error> {
        let mut decompressor = Decompressor::new();

        if let Some(dict) = dictionary {
            decompressor
                .set_dictionary(dict)
                .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        }

        Ok(Self {
            decompressor,
            buffer: Vec::new(),
            input_buffer: Vec::new(),
            eof: false,
        })
    }

    /// Decompress a single chunk of data
    fn decompress_chunk(&mut self, input: &[u8]) -> Result<(), io::Error> {
        // Prepare a sufficiently large output buffer
        let mut output = vec![0; input.len() * 4];

        // Decompress the input
        let read = self
            .decompressor
            .decompress_to_buffer(input, &mut output)
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;

        // Extend the main buffer with decompressed data
        self.buffer.extend_from_slice(&output[..read]);

        Ok(())
    }
}

/// Async stream implementation for the ZstdDecoder
impl Stream for AsyncZstdDecoder {
    type Item = Result<Vec<u8>, io::Error>;

    fn poll_next(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // If we have data in the buffer, return it
        if !self.buffer.is_empty() {
            let chunk = std::mem::take(&mut self.buffer);
            return Poll::Ready(Some(Ok(chunk)));
        }

        // If EOF and no more data, end the stream
        if self.eof && self.input_buffer.is_empty() {
            return Poll::Ready(None);
        }

        Poll::Pending
    }
}

/// Helper methods for working with MPSC channels
impl AsyncZstdDecoder {
    /// Process incoming data from an MPSC receiver
    pub async fn process_mpsc_stream(
        mut self,
        mut receiver: mpsc::Receiver<Vec<u8>>,
        sender: mpsc::Sender<Result<Vec<u8>, io::Error>>,
    ) -> Result<(), io::Error> {
        while let Some(chunk) = receiver.recv().await {
            // Mark EOF if this is the last chunk (empty vector)
            if chunk.is_empty() {
                self.eof = true;
                break;
            }

            // Decompress the chunk
            self.decompress_chunk(&chunk)?;

            // Send decompressed chunks back
            while !self.buffer.is_empty() {
                let chunk = std::mem::take(&mut self.buffer);
                sender
                    .send(Ok(chunk))
                    .await
                    .map_err(|_| io::Error::new(io::ErrorKind::BrokenPipe, "Channel closed"))?;
            }
        }

        Ok(())
    }

    /// Create a stream from an MPSC receiver
    pub fn stream_from_mpsc(
        receiver: mpsc::Receiver<Vec<u8>>,
    ) -> ReceiverStream<Result<Vec<u8>, io::Error>> {
        let (tx, rx) = mpsc::channel(100);

        // Spawn a task to handle decompression
        tokio::spawn(async move {
            let decoder = Self::new(None).expect("Failed to create decoder");
            if let Err(e) = decoder.process_mpsc_stream(receiver, tx).await {
                eprintln!("Decompression error: {:?}", e);
            }
        });

        ReceiverStream::new(rx)
    }
}

// Example usage demonstration
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create channels for compressed and decompressed data
    let (compressed_tx, compressed_rx) = mpsc::channel(100);

    // Simulate some compressed data (this would typically come from network/file)
    let test_data = vec![
        vec![1, 2, 3, 4], // First chunk
        vec![5, 6, 7, 8], // Second chunk
        vec![],           // EOF marker
    ];

    // Send test compressed data
    tokio::spawn(async move {
        for chunk in test_data {
            compressed_tx.send(chunk).await.unwrap();
        }
    });

    // Create a decompression stream
    let mut decompressed_stream = AsyncZstdDecoder::stream_from_mpsc(compressed_rx);

    // Process decompressed stream
    while let Some(chunk_result) = decompressed_stream.next().await {
        match chunk_result {
            Ok(chunk) => println!("Decompressed chunk: {:?}", chunk),
            Err(e) => eprintln!("Decompression error: {:?}", e),
        }
    }

    Ok(())
}
