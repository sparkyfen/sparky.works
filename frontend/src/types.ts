type Merge<A, B> = ({ [K in keyof A]: K extends keyof B ? B[K] : A[K] } &
  B) extends infer O
  ? { [K in keyof O]: O[K] }
  : never;

export type Worker = {
  id: string;
  created_on: string;
  modified_on: string;
}
export type WorkerDetail = {
  id: string;
  status: string;
  total_errors: number;
  total_requests: number;
  environment: string;
  namespace?: string;
}
export interface MergedWorkerDetails extends Merge<Worker, WorkerDetail> {}

export type Workflow = {
  id: string;
  name: string;
  created_on: string;
  modified_on: string;
  version: number;
  organization?: string;
  total_requests?: number;
  total_errors?: number;
};