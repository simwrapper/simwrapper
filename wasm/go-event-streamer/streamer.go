package main

import (
	"fmt"
	"io"
	"log"
	"os"
	"sync"

	"github.com/klauspost/compress/zstd"
)

func main() {
	// thus we wait for goroutines to finish
	var waiter sync.WaitGroup
	waiter.Add(1)

	// Create buffered channels to store things
	// inputChunks := make(chan []byte, 1024)
	messageChannel := make(chan string, 1024)

	// Specify the path to your binary .zst file
	if len(os.Args) != 2 {
		log.Fatalf("Need .zst filename")
	}
	filePath := os.Args[1] // "kelheim.events.xml.zst"

	// Read the file into a byte slice
	compressed, err := os.ReadFile(filePath)
	if err != nil {
		log.Fatalf("Error reading file: %v", err)
	}

	// Create a pipe for streaming compressed data into Decoder
	reader, writer := io.Pipe()

	// Zstd decoder attached to the pipe reader
	decoder, _ := zstd.NewReader(reader)

	// -----------------------------------------------------------
	// goroutine: push chunks of compressed data into pipe
	go func() {
		defer writer.Close() // remove this later, we'll send ourselves a 0-byte to signal end

		// Simulate chunks of data being written to the stream
		lenOfCompressedData := len(compressed)
		chunkSize := 1_000_000
		n := 0

		for n < lenOfCompressedData {
			log.Println("--writing", n)
			writer.Write(compressed[n:min(n+chunkSize, lenOfCompressedData)]) // Write compressed chunk
			n += chunkSize
		}
		log.Println("--finished writing", len(compressed))
	}()

	// --------------------------------------------------------
	// Decompress chunks as the arrive; hock 'em' onto the channel as we go
	go func() {
		// Buffer to hold decompressed chunks
		outputChunkSize := 65536
		buffer := make([]byte, outputChunkSize)

		for {
			// Read a chunk of decompressed data
			n, err := decoder.Read(buffer)
			if err != nil && err != io.EOF {
				fmt.Println("Error during decompression:", err)
				return
			}

			// Write the decompressed chunk to the channel
			if n > 0 {
				messageChannel <- string(buffer[:n])
			}

			if err == io.EOF {
				log.Println("eof")
				close(messageChannel)
				return
			}
		}
	}()

	// --------------------------------------------
	// retrieve the fruits of our labors
	go func() {
		defer waiter.Done()

		// Retrieve all messages currently in the channel
		counter := 0
		for text := range messageChannel {
			counter++

			// Simulate sending messages to API
			if len(text) > 0 {
				log.Println("Size", len(text), ": Retrieved", counter, "messages")
				// --output to stdout::
				fmt.Print(text)
			}
		}
	}()

	// Keep the main goroutine alive until processing is done
	waiter.Wait()
}
