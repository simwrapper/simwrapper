package main

import (
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"os"
	"runtime"
	"sync"

	"github.com/klauspost/compress/zstd"
	"github.com/teamortix/golang-wasm/wasm"
)

// Create buffered channels to store things
var messageChannel chan string

// Zstd decoder
var decoder io.Reader

// Pipe for streaming compressed data into Decoder
var reader *io.PipeReader
var writer *io.PipeWriter

func submitChunk(encoded string) int {

	// an empty chunk signals end of data.
	if len(encoded) == 0 {
		writer.Close()
	} else {
		chunk, _ := base64.StdEncoding.DecodeString(encoded)
		// pump the chunk into the pipe so the decompressor gets it
		writer.Write(chunk)
	}
	return 0
}

func retrieveText(final bool) string {
	// retrieve the fruits of our labors: drain all messages currently in the channel
	text := ""
	for {
		select {
		case msg, ok := <-messageChannel:
			if !ok { // channel is closed
				text += msg
				if len(text) > 0 {
					return text
				} else {
					return "/DONE/"
				}
			}
			// channel has stuff!
			text += msg
		default:
			// channel is empty, but not closed
			return text
		}
	}
}

// // does not block: just clear current messages
// if !final {
// 	var text string
// 	for {
// 		select {
// 		case msg := <-messageChannel:
// 			text += msg
// 		default:
// 			return text
// 		}
// 	}
// }

// // blocks do this at the end, we want to drain all final messages
// // if final {
// var text string
// for msg := range messageChannel {
// 	if len(msg) > 0 {
// 		text += msg
// 	}
// }
// return text
// // }
// // return ""
// }

func main() {
	listen := make(chan struct{}, 0)

	// comm channels and pipes
	messageChannel = make(chan string, 1024)
	reader, writer = io.Pipe()
	// decoder, _ = zstd.NewReader(reader)

	decoder, _ := zstd.NewReader(reader,
		zstd.WithDecoderConcurrency(1),   // Limit concurrency
		zstd.WithDecoderMaxWindow(1<<24), // Limit window size to 16MB
	)

	// // Respond to retrieval requests
	// go func() {
	// 	outputChunkSize := 131072 // 128k

	// }()

	// --------------------------------------------------------
	// Decompress chunks as they arrive; hock 'em' onto the channel as we go
	go func() {
		// Buffer to hold decompressed chunks
		outputChunkSize := 131072 // 128k
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
				runtime.GC()
			}
			if err == io.EOF {
				log.Println("eof")
				close(messageChannel)
				return
			}
		}
	}()

	wasm.Expose("submitChunk", submitChunk)
	wasm.Expose("retrieveText", retrieveText)
	wasm.Ready()

	// listen forever; we'll let javascript kill the worker
	<-listen
}

// #############################################
// #############################################
func xmain() {
	// we wait for goroutines to finish
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
