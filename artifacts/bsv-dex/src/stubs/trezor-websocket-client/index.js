export class WebsocketClient {
  constructor() {}
  open() { return Promise.resolve(); }
  close() {}
  request() { return Promise.resolve({}); }
  on() {}
  off() {}
}
export default WebsocketClient;
