// This fetches all folders from all root filesystems, and returns
import store from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'

let foundFolders = { number: 0, folders: {} as any }

const findRuns = function () {
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
    if (!root.hidden && root.slug !== 'gallery') drillIntoRootProject(root)
  })
}

const drillIntoRootProject = function (root: FileSystemConfig) {
  console.log('Drilling into:', root.name)

  const fileSystem = new HTTPFileSystem(root)
  fileSystem.clearCache()

  foundFolders.folders[root.name] = []

  fetchFolders(root, fileSystem, '', 0)
}

const fetchFolders = async function (
  root: FileSystemConfig,
  fileSystem: HTTPFileSystem,
  folder: string,
  deep: number
) {
  try {
    // skip some big folders we know we don't care about
    if (root.skipList && root.skipList.filter(f => folder.endsWith(f)).length) return

    // skip .dot and __MACOSX folders
    if (folder.endsWith('__MACOSX')) return
    if (folder.split('/').pop()?.startsWith('.')) {
      return
    }

    const { dirs } = await fileSystem.getDirectory(folder)
    const realDirs = dirs.filter(d => !d.startsWith('.'))
    for (const dir of realDirs) {
      foundFolders.number++
      foundFolders.folders[root.name].push({ root, path: folder + '/' + dir })
      foundFolders.folders[root.name].sort((a: any, b: any) => (a.path < b.path ? -1 : 1))
    }

    // save the results
    store.commit('updateRunFolders', foundFolders)
    localStorage.setItem('RunFinder.foundFolders', JSON.stringify(foundFolders.folders))

    if (deep < 1) {
      for (const dir of realDirs) {
        fetchFolders(root, fileSystem, `${folder}/${dir}`, deep + 1)
      }
    }
  } catch (e) {
    // console.warn(e)
  }
}

export default { findRuns, populate }
