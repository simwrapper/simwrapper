// Helper functions that do data processing in support of map layers
import * as Comlink from 'comlink'

import Coords from '@/js/Coords'
import { DataTable, DataTableColumn, DataType } from '@/Globals'

const myWorker = {
  cbStatus: {} as Function,
  numFeatures: 0,

  statusUpdate(text: string) {
    this.cbStatus(text)
  },
}

Comlink.expose(myWorker)
