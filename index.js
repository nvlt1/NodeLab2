require('./utils');
const express = require('express');
require('dotenv').config();
const session = require('express-session');
const bcrypt = require('bcrypt');
const saltRounds = 12;
const MongoStore = require('connect-mongo');

const database = include('databaseConnection');
const db_utils = include('database/db_utils');
const success = db_utils.printMySQLVersion();
const db_users = include('database/users');

const port = process.env.PORT || 3000;
const app = express();
const expireTime = 60 * 60 * 1000 // expires after 1 hour (hours * minutes * seconds * milliseconds)

app.set('view engine', 'ejs');

app.use(express.urlencoded({extended: false}))
// users and passwords (in memory 'database)
// var users = [];
var userTodos = [];


/* secret information section*/
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;
const node_session_secret = process.env.NODE_SESSION_SECRET;
// /* END secret section*/

var mongoStore = MongoStore.create({
    // need to give admin privileges and ensure the correct user and password.
	mongoUrl : `mongodb+srv://${mongodb_user}:${mongodb_password}@atlascluster.oqysggr.mongodb.net/?retryWrites=true&w=majority`,
    crypto: {
        secret: mongodb_session_secret
    }
})

app.use(session({
    secret: node_session_secret,
    //store: mongoStore, // default is memory store
    saveUninitialized: false,
    resave: true
}));


app.get('/', (req, res) => {
    res.render('index', { session: req.session });
});

app.get('/signup', (req, res) => {
    var missingUsername = req.query.missing;
    var missingEmail = req.query.missing;
    var missingPassword = req.query.missing;
    res.render('signup', {
        missingUsername: missingUsername,
        missingEmail: missingEmail,
        missingPassword: missingPassword
    });
});

// app.get('/members', (req, res) => {
//     if (req.session.authenticated){
//         res.render('members', { session: req.session, authenticated: req.session.authenticated, username: req.session.username, userTodos: userTodos });
//         // res.render('members', {session: req.session});
//     } else {
//         res.redirect('/');
//     }
// })

app.get('/members', sessionValidation, (req, res) => {
    if (req.session.user_type === 'admin') {
      db_users.getUsers().then((users) => {
        res.render('admin', { session: req.session, users });
      }).catch((err) => {
        res.render('errorMessage', { error: 'Failed to fetch users.' });
      });
    } else {
      db_users.getUserTodos(req.session.user_id).then((todos) => {
        res.render('members', {
          session: req.session,
          authenticated: req.session.authenticated,
          username: req.session.username,
          userTodos: todos,
        });
      }).catch((err) => {
        res.render('errorMessage', { error: 'Failed to fetch todos.' });
      });
    }
  });
  
  app.get('/admin/user/:id', sessionValidation, (req, res) => {
    if (req.session.user_type !== 'admin') {
      res.redirect('/members');
      return;
    }
    db_users.getUserTodos(req.params.id).then((todos) => {
      res.render('userTodos', { session: req.session, userTodos: todos });
    }).catch((err) => {
      res.render('errorMessage', { error: 'Failed to fetch todos.' });
    });
  });


app.get('/createTables', async (req,res) => {

    const create_tables = include('database/create_tables');

    var success = create_tables.createTables();
    if (success) {
        res.render("successMessage", {message: "Created tables."} );
    }
    else {
        res.render("errorMessage", {error: "Failed to create tables."} );
    }
});

app.post('/logout', (req, res) => {
    req.session.authenticated = false;
    res.redirect('/');
});

app.post('/submitUser', async (req, res) => {
    var username = req.body.username;
    var email = req.body.email;
    var password = req.body.password;
    // if (!username){
    //     res.redirect('/signup?missing=1');
    // }
    // if (!email) {
    //     res.redirect('/signup?missing=2');
    // }
    // if (!password){
    //     res.redirect('/signup?missing=3');
    // }

    var hashedPassword = bcrypt.hashSync(password, saltRounds);

    //users.push({ username: username, email: email , password: hashedPassword });

    //var success = await db_users.createUser({ user: username, hashedPassword: hashedPassword });
    var success = await db_users.createUser({ user: username, email: email, hashedPassword: hashedPassword });


    if (success) {
        var results = await db_users.getUsers();

        res.render("submitUser",{users:results});
    }
    else {
        res.render("errorMessage", {error: "Failed to create user."} );
    }
    res.redirect('/members');
});

function isValidSession(req) {
    if (req.session.authenticated) {
        return true;
    }
    return false;
}

function sessionValidation(req, res, next) {
    if (isValidSession(req)) {
      if (req.session.user_type === 'admin') {
        next(); 
      } else {
        res.redirect('/members');
      }
    } else {
      req.session.destroy();
      res.redirect('/');
    }
  }
  

// function sessionValidation(req, res, next) {
//     if (!isValidSession(req)) {
//         req.session.destroy();
//         res.redirect('/login');
//         return;
//     }
//     else {
//         next();
//     }
// }



function isAdmin(req) {
    if (req.session.user_type == 'admin') {
        return true;
    }
    return false;
}

function adminAuthorization(req, res, next) {
    if (!isAdmin(req)) {
        res.status(403);
        res.render("errorMessage", {error: "Not Authorized"});
        return;
    }
    else {
        next();
    }
}

app.use('/loggedin', sessionValidation);
app.use('/loggedin/admin', adminAuthorization);

app.get('/loggedin/info', (req,res) => {
    res.render("loggedin-info");
});

app.get('/loggedin/admin', (req,res) => {
    res.render("admin");
});

app.post('/loggingin', async (req, res) => {
    var username = req.body.username;
    var password = req.body.password;

    var results = await db_users.getUser({ user: username, hashedPassword: password });

    if (results) {
        if (results.length == 1) { //there should only be 1 user in the db that matches
            if (bcrypt.compareSync(password, results[0].password)) {
                req.session.authenticated= true;
                req.session.user_type = results[0].type
                req.session.username = username;
                req.session.cookie.maxAge = expireTime;

                res.redirect('/members');
                return;
            }
        }
        else{
            res.redirect('/login');
            return;
        }
    }
    
    // user and password combination not found
    // res.redirect('/loggedin');
    res.redirect('/login');
});



app.post('/login', (req, res) => {
    res.render('login');
});

app.get('/admin', (req, res) => {
    if (req.session.authenticated && req.session.userType === "admin") {
      const displayUsers = () => {
        fetch('/api/users')
          .then(response => response.json())
          .then(users => {
            res.render('admin', { users });
          })
          .catch(error => console.error(error));
      };
      displayUsers();
    } else {
      res.redirect('/todo');
    }
  });
  

app.get('/todo', (req, res) => {
    res.render('todo.ejs', {
      authenticated: req.session.authenticated,
      username: req.session.username,
      userTodos: userTodos
    });
  });
  
  app.post('/create-todo', (req, res) => {
    if (req.session.authenticated) {
      const newTodo = req.body.todo;
      userTodos.push(newTodo);
      res.redirect('/todo');
    } else {
      res.redirect('/');
    }
  });
  


app.use(express.static(__dirname + "/public"));


app.get("*", (req,res) => {
    res.status(404);
    res.render("404");
});

app.listen(port, (req, res) => {
    console.log("Node application listening on port " + port);
});





