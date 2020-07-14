import { FileSystem } from '@/Globals'

export interface InitParams {
  fileApi: string
  filePath: string
}

export enum MethodNames {
  FetchXML = 'FetchXML',
}
