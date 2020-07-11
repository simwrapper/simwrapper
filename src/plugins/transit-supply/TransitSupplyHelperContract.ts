export interface InitParams {
  xml: any
  projection: string
}

export enum MethodNames {
  CreateNodesAndLinks = 'CreateNodesAndLinks',
  ConvertCoordinates = 'ConvertCoordinates',
  ProcessTransit = 'ProcessTransit',
}
