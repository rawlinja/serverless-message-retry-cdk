import { StatusCodes } from 'http-status-codes'

const returnSuccess = (body: string) => {
  return {
    headers: { 'Content-Type': 'application/json' },
    statusCode: StatusCodes.OK,
    body,
  }
}
const returnError = (body: string) => {
  return {
    headers: { 'Content-Type': 'application/json' },
    statusCode: StatusCodes.BAD_REQUEST,
    body,
  }
}

const returnServerError = (body: string) => {
  return {
    headers: { 'Content-Type': 'application/json' },
    statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    body,
  }
}

export { returnSuccess, returnError, returnServerError }
