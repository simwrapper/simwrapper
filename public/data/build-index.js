'use strict'

// COMMAND:
// node build-index.js
//
// this will create an index.html file listing in each folder + subfolder 

const fs = require('fs')

const indexTemplate =
  () => `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd"> \n\
<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><title>Directory listing for /</title></head> \n\
<body>\n\
<h1>Directory listing for %%FOLDER%%</h1><hr/>\n\
<ul>\n\
%%LISTING%%\n\
</ul>\n\
<hr/>\n\
</body>\n\
</html>`

const getFolderContent = source =>
  fs.readdirSync(source, {
    withFileTypes: true,
  })

const buildIndexForFolder = source => {
  const content = getFolderContent(source)

  const folders = []
  let listing = []

  // Up '..' - broken for now
  // if (source !== '.') {
  //   const url = encodeURIComponent(source.substring(0, source.lastIndexOf('/')))
  //   console.log(source, url)
  //   listing.push(`<li><a href="${url}/">../</a></li>`)
  // }

  for (const f of content) {
    if (f.name === 'index.html') continue

    const clean = encodeURIComponent(f.name)

    if (f.isDirectory()) {
      listing.push(`<li><a href="${clean}/">${f.name}/</a></li>`)
      folders.push(`${source}/${f.name}`)
    } else {
      listing.push(`<li><a href="${clean}">${f.name}</a></li>`)
    }
  }

  let template = indexTemplate()
  template = template.replace('%%FOLDER%%', source)
  template = template.replace('%%LISTING%%', listing.join('\n'))

  const indexHTML = `${source}/index.html`
  console.log('Writing', indexHTML)

  fs.writeFileSync(indexHTML, template)

  for (const folder of folders) {
    buildIndexForFolder(folder)
  }
}

buildIndexForFolder('.')
