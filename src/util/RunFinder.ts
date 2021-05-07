// This fetches all folders from all root filesystems, and returns
import store from '@/store'
import HTTPFileSystem from '@/util/HTTPFileSystem'
import { SVNProject } from '@/Globals'

let foundFolders = { number: 0, folders: {} as any }

const populate = function() {
  console.log('here we go!')
  foundFolders = { number: 0, folders: {} }
  store.commit('updateRunFolders', foundFolders)

  store.state.svnProjects.forEach(root => {
    if (root.url !== 'gallery') drillIntoRootProject(root)
  })
}

const drillIntoRootProject = function(root: SVNProject) {
  console.log('Drilling into:', root.name)
  const fileSystem = new HTTPFileSystem(root)

  foundFolders.folders[root.name] = []

  fetchFolders(root, fileSystem, '')
}

const fetchFolders = async function(root: SVNProject, fileSystem: HTTPFileSystem, folder: string) {
  try {
    const { dirs, files } = await fileSystem.getDirectory(folder)

    foundFolders.number++

    if (files.filter(f => f.endsWith('xml.gz')).length) {
      foundFolders.folders[root.name].push({ root, firstFolder: 'hi', path: folder })
    }

    store.commit('updateRunFolders', foundFolders)

    for (const dir of dirs) {
      fetchFolders(root, fileSystem, `${folder}/${dir}`)
    }
  } catch (e) {
    console.error(e)
  }
}

export default { populate }
