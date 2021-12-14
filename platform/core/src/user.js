let _headers = {};

// These should be overridden by the implementation
let user = {
  userLoggedIn: () => false,
  getUserId: () => null,
  getName: () => null,
  getAccessToken: () => null,
  login: () => new Promise((resolve, reject) => reject()),
  logout: () => new Promise((resolve, reject) => reject()),
  getData: key => null,
  setData: (key, value) => null,
  setHeaders: headers => {
    _headers = { ..._headers, ...headers };
  },
  getHeaders: () => _headers,
};

export default user;
