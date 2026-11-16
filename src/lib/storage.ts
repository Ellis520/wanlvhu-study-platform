import { StorageClient } from 'coder-coding-dev-sdk'

let client: StorageClient | undefined

/** Construct only during an actual request; builds do not need vendor secrets. */
export function getStorage(): StorageClient {
  client ??= new StorageClient()
  return client
}
