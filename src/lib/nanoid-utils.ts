import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('1234567890abcdef', 6)

const generateId = () => {
  return nanoid()
}

export { generateId }
