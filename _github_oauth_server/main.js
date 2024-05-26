const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET

// server.js
const express = require('express')
const session = require('express-session')
const passport = require('passport')
const crypto = require('crypto')
const GitHubStrategy = require('passport-github2').Strategy
const SESSION_SECRET = crypto.randomBytes(96).toString('hex')

const cors = require('cors')

const app = express()
const PORT = 3000

// randomID: token
const lookup = {}

// Configure Passport
passport.use(
  new GitHubStrategy(
    {
      clientID: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackURL: 'https://simwrapper-oauth-github.fly.dev/auth/github/callback',
    },

    function (accessToken, refreshToken, profile, done) {
      // insert the accessToken into the user profile which gets sent with requests
      profile.accessToken = accessToken
      return done(null, profile)
    }
  )
)

passport.serializeUser(function (user, done) {
  done(null, user)
})

passport.deserializeUser(function (obj, done) {
  done(null, obj)
})

// Middleware
app.use(cors())

// TODO: ADD THESE ---------------
// const helmet = require('helmet')
// app.use(helmet())
// const csrf = require('csurf') // deprecated
// app.use(csrf())

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 3600000,
    },
  })
)
app.use(passport.initialize())
app.use(passport.session())

// Routes
app.get('/', (req, res) => {
  res.send(
    '<h1>SimWrapper</h1><p>Use GitHub Gists to store small datasets</p>' +
      '<h3><a href="/auth/github">Login with GitHub</a></h3>'
  )
})

app.get('/auth/github', (req, res, next) => {
  // THIS IS THE KEY TO MAKING THIS WORK:
  // Pass the session randomID in as a "state" parameter, which GitHub Auth will
  // return along with the token in the callback.
  const randomID = req.query.id || ''
  passport.authenticate('github', { state: JSON.stringify({ randomID }), scope: ['gist'] })(
    req,
    res,
    next
  )
})

app.get(
  '/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (req, res) => {
    const token = req.user?.accessToken || ''
    const state = JSON.parse(req.query?.state || { randomID: -1 })
    // if we have the randomID in the state, then hang onto the token so we can
    // pass it onto the client when ready
    if (token && state) lookup[state.randomID] = token

    res.send(
      `<style>body { font-family: Arial,Helvetica,sans-serif; padding: 1rem; color: darkroyalblue }</style>` +
        `<h1>GitHub authentication successful</h1><h3>Logged in as ${req.user.username}</h3>` +
        `<p>You can close this window now.</p>`
    )
  }
)

app.get('/profile', ensureAuthenticated, (req, res) => {
  res.send(`<h1>Profile</h1><pre>${JSON.stringify(req.user, null, 2)}</pre>`)
})

app.get('/get_auth_token', (req, res) => {
  const id = req.query.id || ''

  if (id in lookup) {
    // we have a token!
    const token = lookup[id]
    // but don't keep it around forever
    delete lookup[id]
    // let the client know
    res.json({ token })
  } else {
    res.json({})
  }
})

app.get('/logout', (req, res) => {
  req.logout()
  res.redirect('/')
})

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }
  res.redirect('/')
}

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`)
})

// Can now receive user authorization callbacks at /auth/github/callback
// See all endpoints at https://github.com/octokit/oauth-app.js#middlewares
