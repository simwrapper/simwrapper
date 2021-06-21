// This fetches all folders from all root filesystems, and returns
import store from '@/store'
import HTTPFileSystem from '@/util/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'

let foundFolders = { number: 0, folders: {} as any }

const findRuns = function() {
  // check date and time
  const storedUpdate = localStorage.getItem('RunFinder.lastUpdate')
  const lastUpdate = storedUpdate ? parseInt(storedUpdate) : 0
  const now = Date.now()
  const needUpdate = now - lastUpdate > 1000 * 43200 // 12 hours

  // populate runs from filesystem
  if (needUpdate) {
    populate()
    return
  }

  // otherwise use cached runs
  const oldRuns = localStorage.getItem('RunFinder.foundFolders')
  if (oldRuns) {
    const folders = JSON.parse(oldRuns)
    foundFolders = { number: 0, folders }
    store.commit('updateRunFolders', foundFolders)
    return
  }

  // if we got here, then we need to repopulate no matter what
  populate()
}

const populate = () => {
  console.log('populating run finder!')
  localStorage.setItem('RunFinder.lastUpdate', Date.now().toString())

  foundFolders = { number: 0, folders: {} }
  store.commit('updateRunFolders', foundFolders)

  store.state.svnProjects.forEach(root => {
    if (root.slug !== 'gallery') drillIntoRootProject(root)
  })
}

const drillIntoRootProject = function(root: FileSystemConfig) {
  console.log('Drilling into:', root.name)
  const fileSystem = new HTTPFileSystem(root)

  foundFolders.folders[root.name] = []

  fetchFolders(root, fileSystem, '')
}

const fetchFolders = async function(
  root: FileSystemConfig,
  fileSystem: HTTPFileSystem,
  folder: string
) {
  try {
    // skip some big folders we know we don't care about
    if (root.skipList && root.skipList.filter(f => folder.endsWith(f)).length) return

    const { dirs, files } = await fileSystem.getDirectory(folder)

    foundFolders.number++

    // if (files.filter(f => f.endsWith('xml.gz')).length) {
    if (files.length) {
      foundFolders.folders[root.name].push({ root, path: folder })
    }
    foundFolders.folders[root.name].sort((a: any, b: any) => (a.path < b.path ? -1 : 1))

    // save the results
    store.commit('updateRunFolders', foundFolders)
    localStorage.setItem('RunFinder.foundFolders', JSON.stringify(foundFolders.folders))

    for (const dir of dirs) {
      fetchFolders(root, fileSystem, `${folder}/${dir}`)
    }
  } catch (e) {
    console.error(e)
  }
}

export default { findRuns, populate }
