//go:build js && wasm
// +build js,wasm

package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"runtime"
	"strings"
	"syscall/js"
	"time"

	"github.com/klauspost/compress/zstd"
)

// Create buffered channels to store things
var messageChannel chan string
var ping chan int
var pong chan int

// Zstd decoder
var decoder io.Reader

// Pipe for streaming compressed data into Decoder
var reader *io.PipeReader
var writer *io.PipeWriter

// chunks will split across text lines and we can't parse those
var leftovers string

func submitChunk(this js.Value, args []js.Value) interface{} {
	// Convert from JS Uint8Array to Go byte slice
	encoded := js.Global().Get("Uint8Array").New(args[0])
	mlength := encoded.Get("length").Int()
	chunk := make([]byte, mlength)
	js.CopyBytesToGo(chunk, encoded)

	if len(chunk) == 0 {
		// an empty chunk signals end of data.
		err := writer.Close()
		if err != nil {
			// Pipe is already closed
			fmt.Println("Pipe is already closed")
		}
	} else {
		// pump the chunk into the pipe so the decompressor gets it
		writer.Write(chunk)
	}

	log.Println("hi")
	// Clear the timeout channel
	// loop1:
	// for {
	select {
	case <-pong:
		break
	default:
		// nothing there, that's fine
		break
	}

	// }

	log.Println("hi2")
	time.Sleep(100 * time.Millisecond)

	// Signal the timeout channel to start worrying
	// ping <- 1

	runtime.Gosched()
	time.Sleep(100 * time.Millisecond)

	log.Println("hi3")
	// Now we are going to block until one answer shows up in the hopper
loopA:
	for {
		time.Sleep(300 * time.Millisecond)

		select {
		// case <-pong:
		// 	// tired of waiting
		// 	log.Println("timeout")
		// 	return js.ValueOf("[]")
		case json, ok := <-messageChannel:
			if ok {
				log.Println("got json")
				return js.ValueOf(json)
			} else {
				return js.ValueOf("")
			}
		default:
			break loopA
		}
	}
	return js.ValueOf("[]")
}

func retrieveText(this js.Value, args []js.Value) interface{} {
	// retrieve the fruits of our labors: drain all messages currently in the channel
	text := ""
	for {
		select {
		case msg, ok := <-messageChannel:
			if !ok { // channel is closed
				text += msg
				if len(text) > 0 {
					return js.ValueOf(text)
				} else {
					return js.ValueOf("/DONE/")
				}
			}
			// channel has stuff!
			text += msg
		default:
			// channel is empty, but not closed
			return js.ValueOf(text)
		}
	}
}

func processRawText(raw []byte) string {
	var outputRows []string

	rawText := string(raw)

	// start with previous leftovers
	eventText := leftovers + rawText

	// chop off final fragment
	endOfLine := strings.LastIndex(eventText, "\n")
	if endOfLine < len(eventText) {
		leftovers = eventText[(1 + endOfLine):]
	} else {
		leftovers = ""
	}

	validText := eventText[:endOfLine]

	type Event struct {
		XMLName xml.Name   `xml:"event"`
		Attrs   []xml.Attr `xml:",any,attr"` // Capture all attributes
	}

	// ## Go doesn't have map/filter/reduce functions, sad =(
	// split into event rows and clean up

	eventRows := strings.Split(validText, "\n")
	for _, row := range eventRows {
		trimmed := strings.TrimSpace(row)
		if strings.HasPrefix(trimmed, "<event ") {
			var event Event
			err := xml.Unmarshal([]byte(trimmed), &event)
			if err == nil {
				attrs := make(map[string]string)
				for _, attr := range event.Attrs {
					attrs[attr.Name.Local] = attr.Value
				}
				jsonData, err := json.Marshal(attrs)
				if err == nil {
					outputRows = append(outputRows, string(jsonData))
				}
			}
		}
	}
	finalText := strings.Join(outputRows, ",\n") + ",\n"
	return finalText
}

func main() {

	// comm channels and pipes
	messageChannel = make(chan string)
	reader, writer = io.Pipe()

	// decoder, _ = zstd.NewReader(reader)
	decoder, _ := zstd.NewReader(reader,
		zstd.WithDecoderConcurrency(1),   // Limit concurrency
		zstd.WithDecoderMaxWindow(1<<24), // Limit window size to 16MB
	)

	// --------------------------------------------------------
	// Zstd emitter can block if it doesn't receive enough data.
	// So this timer lets us keep sending chunks until its hunger is satisfied
	go func() {
		for {
			log.Println("wait1")
			runtime.Gosched()

			select {
			case <-ping:
				log.Println("wait2")
				time.Sleep(100 * time.Millisecond)
				log.Println("wait3")
				pong <- 1
				log.Println("wait4")
			default:
				time.Sleep(100 * time.Millisecond)
			}
		}
	}()

	// --------------------------------------------------------
	// Decompress chunks as they arrive; hock 'em' onto the channel as we go
	go func() {
		// Buffer to hold decompressed chunks
		outputChunkSize := 1024 * 1024 // 128k
		buffer := make([]byte, outputChunkSize)

		var processedText string

		for {
			// Read a chunk of decompressed data
			n, err := decoder.Read(buffer)
			if err != nil && err != io.EOF {
				fmt.Println("Error during decompression:", err)
				return
			}
			if n == 0 {
				log.Printf("none here")
				// no current data read
				messageChannel <- processedText
				processedText = ""
			}
			// Process the decompressed chunk
			if n > 0 {
				json := processRawText(buffer[:n])
				processedText += json
				// messageChannel <- json
				runtime.GC()
			}
			if err == io.EOF {
				log.Println("eof")
				close(messageChannel)
				return
			}
		}
	}()

	// ----- Expose functions to JavaScript
	js.Global().Set("submitChunk", js.FuncOf(submitChunk))
	js.Global().Set("retrieveText", js.FuncOf(retrieveText))

	// listen forever; we'll let javascript kill the worker
	// select {}

	for {
		// select {
		// case v := <-ch1:
		// 	fmt.Println("Received from ch1:", v)
		// case v := <-ch2:
		// 	fmt.Println("Received from ch2:", v)
		// default:
		// Prevents blocking
		time.Sleep(250 * time.Millisecond)
	}
}
