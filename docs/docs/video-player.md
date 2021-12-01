---
id: video
title: Video Player
---

This viz allows playing of MP4 and MOV video files to be streamed.

## Usage

Currently, only MP4 files with suffix `.mp4` will be playable.

## To STREAM videos instead of loading entire video first

You need to make sure metadata is at the FRONT of the video file, not the back. This is stupid, but is also why YouTube transcodes every file you upload no matter what.
https://stackoverflow.com/questions/13705409/mp4-in-video-js-not-playing-until-fully-loaded

- install `gpac`
- run `MP4Box -add origfile.mp4 fixedfile.mp4`
- or perhaps `MP4Box -isma myfile.mp4`
