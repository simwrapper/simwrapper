import * as avro from 'avro-js'
import * as fs from 'fs'

interface AvroDataset {
  [key: string]: any
}

export default class AvroDataManager {
  private datasets: { [key: string]: Promise<AvroDataset> } = {}

  /**
   * Retrieves a dataset from an Avro file based on configuration parameters.
   *
   * @param config Configuration parameters for the dataset, including filePath and schemaSchema.
   * @returns An object containing the loaded data from the Avro file.
   */
  public async getDatasetAvro(config: any): Promise<{ allRows: AvroDataset }> {
    try {
      if (!this.datasets[config.filePath]) {
        console.log('Loading:', config.filePath)
        this.datasets[config.filePath] = this._fetchDatasetAvro(config)
      }

      const avroDataset = await this.datasets[config.filePath]
      return { allRows: avroDataset }
    } catch (error) {
      console.error('Error loading Avro dataset:', error)
      return { allRows: {} }
    }
  }

  private async _fetchDatasetAvro(config: any): Promise<AvroDataset> {
    try {
      const avroBuffer = fs.readFileSync(config.filePath)
      return avro.readData(avroBuffer, config.schemaSchema)
    } catch (error) {
      console.error('Error loading Avro file:', error)
      return {}
    }
  }
}
