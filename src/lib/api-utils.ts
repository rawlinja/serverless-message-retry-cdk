import {
    StatusCodes,
} from 'http-status-codes'

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

export { returnSuccess, returnError}