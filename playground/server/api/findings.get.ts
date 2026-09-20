import predictions from '../fixtures/mha-response.json'

/**
 * A stand-in for the reporting API a real deployment would call.
 *
 * The payload is one nodule detector's output, kept verbatim so that the
 * adapter in `useStudyFindings()` has to deal with the shape such a service
 * actually returns rather than one shaped to suit the viewer. Only the
 * transport is pretended: a real endpoint would take a study UID and an
 * Authorization header, and the client side of it would look the same.
 */
export default defineEventHandler(() => predictions)
