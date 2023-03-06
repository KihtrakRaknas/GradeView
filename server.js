require('dotenv').config();
const fetch = require('node-fetch')
const { getCurrentGrades, openAndSignIntoGenesis, getSchoolUrl, getIdFromSignInInfo, postFixUsername, openPage } = require('./GradeViewGetCurrentGrades/getCurrentGrades');
const $ = require('cheerio');
const express = require('express')
const bodyParser = require('body-parser');
const weightingObj = require('./classWeightingOutput.json')
const Fuse = require('fuse.js')
const NodeRSA = require('node-rsa');
const key = new NodeRSA({ b: 512 });
//const keysObj = require('./secureContent/keys')
const bwipjs = require('bwip-js');
const { Expo } = require('expo-server-sdk')
key.importKey(process.env.PUBLIC_KEY/*keysObj.public*/, 'pkcs1-public-pem');
key.importKey(process.env.PRIVATE_KEY/*keysObj.private*/, 'pkcs1-private-pem');

let expo = new Expo();

var options = {
  shouldSort: true,
  includeScore: true,
  threshold: 0.6,
  location: 0,
  distance: 100,
  maxPatternLength: 100,
  minMatchCharLength: 2,
  keys: [
    "Name"
  ]
};
var fuse = new Fuse(weightingObj, options);

//console.log(getCurrentGrades('10012734@sbstudents.org','Sled%2#9'));


const app = express()
const port = process.env.PORT || 3000
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

var currentUsers = [];

const admin = require('firebase-admin');

var serviceAccount = JSON.parse(process.env.SERVICE_KEY)//require('./secureContent/serviceKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

var db = admin.firestore();

let handleGradeRequest = async (req, res) => {
  const username = req.body.username;//'10012734'
  const password = req.body.password; //'Sled%2#9'
  const school = req.body.school;
  console.log(req.body);

  var userRef = db.collection('users').doc(postFixUsername(username, school));

  userRef.get()
    .then(doc => {
      if (!doc.exists) {
        console.log('No such document!');
        console.log("cached object not found")
        res.json({ "Status": "loading..." })
        updateGrades(username, password, userRef, school).then(() => {
          //res.end();
        }).catch(err => {
          var index = currentUsers.indexOf(postFixUsername(username, school));
          if (index !== -1) currentUsers.splice(index, 1);
          console.log('Error updating grades', err);
        })
        updateLastAlive(postFixUsername(username, school))
      } else {
        db.collection('userTimestamps').doc(postFixUsername(username, school)).get().then(docTime => {
          if (!docTime.exists || (docTime.exists && docTime.data()["Timestamp"] < new Date().getTime() - (1000 * 60 * 60 * 24 * 30))) {
            //This is a user who has started using the app after a long time
            console.log("updating cache after lack of usage")
            updateGrades(username, password, userRef, school).then(() => {
              //res.end();
            }).catch(err => {
              var index = currentUsers.indexOf(postFixUsername(username, school));
              if (index !== -1) currentUsers.splice(index, 1);
              console.log('Error updating grades', err);
            })
            res.json({ "Status": "loading..." })
          } else {
            var userTokenRef = db.collection('userData').doc(postFixUsername(username, school));
            userTokenRef.get().then(async userTokenDoc => {
              if (userTokenDoc.data() && ((userTokenDoc.data()["password"] && userTokenDoc.data()["password"] == password) || (userTokenDoc.data()["passwordEncrypted"] && key.decrypt(userTokenDoc.data()["passwordEncrypted"], 'utf8') == password))) {
                let dataToReturn = doc.data()
                if(docTime.exists && docTime.data()["AdFree"]){
                  dataToReturn["Status"] = docTime.data()["AdFree"]
                }
                res.json(dataToReturn)
                console.log("returning cached object")
              } else {
                console.log("credentials don't match")
                res.json({ "Status": "Invalid" })
              }
            })
          }
        }).then(() => {
          updateLastAlive(postFixUsername(username, school))
        }).catch((err) => {
          console.log(err)
        })
      }
    })
    .catch(err => {
      console.log('Error getting document', err);
    });
}

app.get('/', (req, res) => { res.send("Hello, your probably exploring the inner workings of GradeView. Nice to meet you!") })

app.post('/', handleGradeRequest)

async function updateLastAlive(username) {
  db.collection('userTimestamps').doc(username).set({
    Timestamp: new Date().getTime()
  },{merge: true}).then(function () {
    console.log("Timestamp added to " + username);
  })
}

app.post('/emailList', async (req, res) => {
  const email = req.body.email;
  var userTokenRef = db.collection('userEmails').doc("emailList");
  userTokenRef.update({
    emails: admin.firestore.FieldValue.arrayUnion(email),
  }).then(function () {
    res.json({ Status: "done" })
  })
});

app.post('/testSignIn', async (req, res) => {
  let email = req.body.username;
  let pass = req.body.password;
  let schoolDomain = req.body.school;

  if (!email || !pass || !email.trim() || !pass.trim())
    return res.send("Email or password is empty");
  email = encodeURIComponent(email);
  pass = encodeURIComponent(pass);
  const { $ } = await openAndSignIntoGenesis(email, pass, schoolDomain)
  return $.html();
})

app.post('/check', async (req, res) => {

  const username = req.body.username;//'10012734'
  const password = req.body.password; //'Sled%2#9'
  const school = req.body.school;
  const referrer = req.body.referrer;
  const referrerSchool = req.body.referrerSchool;

  console.log(req.body);
  var signedIn = await checkUser(username, password, school)
  console.log({ valid: signedIn })
  res.json({ valid: signedIn })
  res.end();

  if (signedIn) {
    var userTokenRef = db.collection('userData').doc(postFixUsername(username, school));
    userTokenRef.get().then(doc => {
      if (!doc.exists) {
        //New User!
        userTokenRef.set({
          //password: password,
          ...(school && { school: school }),
          passwordEncrypted: key.encrypt(password, 'base64')
        }).then(function () {
          console.log("pass added to " + username+" (new doc)");
        })

        if(referrer&&referrerSchool){
          console.log("adding Ad Free to user")
          db.collection('userTimestamps').doc(postFixUsername(referrer, referrerSchool)).get().then((doc)=>{
            let adFreeEndTime;
            if (doc.exists && doc.data() && doc.data()["AdFree"] && doc.data()["AdFree"] > new Date().getTime()) {
              adFreeEndTime = doc.data()["AdFree"]
            }else{
              adFreeEndTime = new Date().getTime()
            }
            adFreeEndTime+=1000*60*60*24*30
            console.log(adFreeEndTime)
            db.collection('userTimestamps').doc(postFixUsername(referrer, referrerSchool)).set({
              AdFree: adFreeEndTime
            },{merge: true}).then(function () {
              fetch(encodeURI(`https://n.kihtrak.com/?project=gradeview&title=${referrer} -> ${username}&body=${`${referrer} invited ${username} with a referral link`}`)).catch(console.log)
              var userDataRef = db.collection('userData').doc(postFixUsername(referrer, referrerSchool));
              userDataRef.get().then(doc => {
                if (doc.exists) {
                  if (doc.data()["Tokens"] && doc.data()["Tokens"].length > 0) {
                    notify(doc.data()["Tokens"], `1 Month of No Ads Added!`, `${username} used your referral link!`, "Thanks!", { txt: "1 Month of No Ads Added! (you might have to refresh for it to show up)" })
                  }
                }
              }).catch(console.log)
              console.log(`AdFree added to ${referrer}: ${adFreeEndTime}`);
            }).catch(console.log)
          }).catch(console.log)
        }
      } else {
        userTokenRef.update({
          //password: password,
          ...(school && { school: school }),
          passwordEncrypted: key.encrypt(password, 'base64')
        }).then(function () {
          console.log("pass added to " + username);
        })
      }
    });
  } else {
    return null;
  }
  var userRef = db.collection('users').doc(postFixUsername(username, school));
  return updateGrades(username, password, userRef, school).then(() => {
    //res.end();
    updateLastAlive(postFixUsername(username, school))
  }).catch(err => {
    var index = currentUsers.indexOf(postFixUsername(username, school));
    if (index !== -1) currentUsers.splice(index, 1);
    console.log('Error updating grades', err);
  })

})

app.post('/oldGrades', async (req, res) => {

  const username = req.body.username;//'10012734'
  const password = req.body.password; //'Sled%2#9'
  const schoolDomain = req.body.school;

  return res.json(await getPreviousYearsFinalLetterGrades(username, password, schoolDomain));

})



app.post('/newGrades', async (req, res) => {
  const username = req.body.username;//'10012734'
  const password = req.body.password; //'Sled%2#9'
  const schoolDomain = req.body.school;

  return res.json(await getThisYearsMPLetterGrades(username, password, schoolDomain));
})

app.get('/testNotification', async (req, res) => {
  if (req.query.token)
    setTimeout(() => notify([req.query.token], "Test title", "Test subtitle", "Notification body", { txt: "Testing" }), 30 * 1000)
  return res.send("attempted")
})

app.get('/dir', async (req, res) => {
  await fetch(`https://github.com/KihtrakRaknas/DirectoryScraper/raw/master/outputEncoded.txt`).then((fetchRes)=>{
    fetchRes.text().then((data)=>{
      const key = new NodeRSA();
      key.importKey(process.env.DIR_PUBLIC_KEY, 'public');
      res.json(JSON.parse(key.decryptPublic(data)))
    })
  }).catch(console.log)
})

async function updateGrades(username, password, userRef, school) {
  console.log(currentUsers)
  if (!currentUsers.includes(postFixUsername(username, school))) {
    currentUsers.push(postFixUsername(username, school))
    console.log("Updating cache for future requests")

    var dataObj = await getCurrentGrades(username, password, school)
    if (dataObj["Status"] == "Completed") {
      console.log(dataObj["Status"])
      userRef.set(dataObj);
    } else {
      console.log("Not cached due to bad request")
    }

    var index = currentUsers.indexOf(postFixUsername(username, school));
    if (index !== -1) currentUsers.splice(index, 1);
  }
  return "done";
}

app.post('/addToken', async (req, res) => {
  const username = req.body.user.username;
  const password = req.body.user.password;
  const schoolDomain = req.body.user.school;
  const token = req.body.token.value;

  if (username && token && password) {
    var userTokenRef = db.collection('userData').doc(postFixUsername(username, schoolDomain));
    userTokenRef.get().then(async doc => {
      if (!doc.exists) {
        var valid = await checkUser(username, password, schoolDomain);
        if (valid) {
          userTokenRef.set({
            Tokens: admin.firestore.FieldValue.arrayUnion(token),
            //password: password,
            ...(school && { school: schoolDomain }),
            passwordEncrypted: key.encrypt(password, 'base64')
          }).then(function () {
            console.log(token + " added to " + username);
            res.json({ "Status": "Completed" })
          })
        }
      } else {
        //No check needed if password matches stored password
        if (doc.data() && ((doc.data()["password"] && doc.data()["password"] == password) || (doc.data()["passwordEncrypted"] && key.decrypt(doc.data()["passwordEncrypted"], 'utf8') == password))) {
          userTokenRef.update({
            Tokens: admin.firestore.FieldValue.arrayUnion(token),
          }).then(function () {
            console.log(token + " added to " + username);
            res.json({ "Status": "Completed" })
          })
        } else {
          var valid = await checkUser(username, password, schoolDomain);
          if (valid) {
            userTokenRef.update({
              Tokens: admin.firestore.FieldValue.arrayUnion(token),
              //password: password,
              ...(school && { school: schoolDomain }),
              passwordEncrypted: key.encrypt(password, 'base64')
            }).then(function () {
              console.log(token + " added to " + username);
              res.json({ "Status": "Completed" })
            })
          }
        }
      }
    });

  } else {
    res.json({ "Status": "Missing params" })
  }
});

app.get('/id', async (req, res) => {
  //res.json({get:"gotten"})
  const id = req.query.id;//'10012734'
  bwipjs.toBuffer({
    bcid: 'code39',       // Barcode type
    text: id,    // Text to encode
    scale: 3,               // 3x scaling factor
    height: 10,              // Bar height, in millimeters
    includetext: true,            // Show human-readable text
    textxalign: 'center',        // Always good to set this
  }, function (err, png) {
    if (err) {
      res.send(err)
    } else {
      res.send('data:image/png;base64,' + png.toString('base64'))
    }
  });
})

app.get('/checkCode', async (req, res) => {
  return db.collection('errors').doc('secure').get().then(doc => {
    if (!doc.exists) {
      console.log('No such document!');
      return res.send("false")
    } else {
      if (doc.data()["noAdCode"] && doc.data()["noAdCode"] == req.query.code)
        return res.send("true")
      return res.send("false")
    }
  })
})


app.listen(port, () => console.log(`Example app listening on port ${port}!`))

//var id = '10012734'

async function checkUser(email, pass, schoolDomain) {
  if (!email || !pass || !email.trim() || !pass.trim())
    return false;
  email = encodeURIComponent(email);
  pass = encodeURIComponent(pass);
  const { signedIn } = await openAndSignIntoGenesis(email, pass, schoolDomain)
  return signedIn;
}

app.post('/money', async (req, res) => {
  var email = req.body.username;//'10012734'
  var pass = req.body.password; //'Sled%2#9'
  var schoolDomain = req.body.school; //'Sled%2#9'

  email = encodeURIComponent(email);
  pass = encodeURIComponent(pass);

  const signInInfo = await openAndSignIntoGenesis(email, pass, schoolDomain)
  const cookieJar = signInInfo.cookie
  //Verify Sign in was successful
  if (!signInInfo.signedIn) {
    console.log("BAD user||pass")
    return { Status: "Invalid" };
  }
  
  const url3 = getSchoolUrl(schoolDomain, "main") + "?tab1=studentdata&tab2=studentsummary&action=form&studentid=" + getIdFromSignInInfo(signInInfo);
  const sumPage = await openPage(cookieJar, url3, signInInfo.userAgent);

  let money = "No value found"
  $(".cellLeft", sumPage).each(function (i, el) {
    if ($(el).text().trim().substring(0, 1) === "$") {
      money = $(el).text().trim()
    }
  })

  return res.json({ money });

})

//GPA

function cleanStr(str) {
  return str
    .toLowerCase()
    .replace(new RegExp("advanced placement", 'g'), 'ap')
    .replace(new RegExp(" and ", 'g'), '')
    .replace(new RegExp(" ", 'g'), '')
    .replace(new RegExp("-", 'g'), '')
    .replace(new RegExp("/", 'g'), '')
    .replace(new RegExp("&", 'g'), '')
}

function cleanStrForFuzzy(str) {
  if (str.indexOf(" ") != -1 && str.substring(0, str.indexOf(" ")) == "AP")
    str = "advanced placement" + str.substring(str.indexOf(" "))
  return str.toLowerCase().replace(new RegExp("-", 'g'), ' ').replace(new RegExp("/", 'g'), ' ').replace(new RegExp("&", 'g'), 'and')
}

//classGrades[classIndex]["Name"]

function findWeight(search) {
  for (var className of weightingObj) {
    //console.log(classGrades[yr][classIndex])
    if (cleanStr(search) == cleanStr(className["Name"])) {
      return className["Weight"];
    }
  }

  for (let honorsKeyWord of ["honors", "h"])
    if (search.toLowerCase().split(/(\s+)/).includes(honorsKeyWord))
      return "Honors Weighting"

  for (let apKeyWord of ["ap", "cip"])
    if (search.toLowerCase().split(/(\s+)/).includes(apKeyWord))
      return "A.P. Weighting"

  var result = fuse.search(cleanStrForFuzzy(search));
  if (result[0] && result[0]["item"]) {
    db.collection('errors').doc("Fuzzy Search Results").update({
      err: admin.firestore.FieldValue.arrayUnion("search: " + search + "; res: " + result[0]["item"]["Name"]),
    })
    return result[0]["item"]["Weight"]
  }

  return null;
}


async function scrapeClassGrades($) {
  const years = [];
  let assignments = [];

  $(".list>tbody>tr").each((i, el) => {
    const columns = $("td",el)
    const rowClass = $(el).attr('class')
    if (rowClass && !rowClass.includes("listheading") && columns.length >= 7) {
      var assignData = {};
      if (!Number(columns.eq(5).text()))
        return
      assignData["Credits"] = Number(columns.eq(5).text())
      //console.log(node.childNodes);
      //console.log(node.childNodes[3].innerText);
      assignData["FG"] = columns.eq(4).text().trim();

      assignData["Name"] = columns.eq(2).text().trim().replace(/\s+/g, ' ');
      assignments.push(assignData);
    } else if (rowClass && !rowClass.includes("listheading") && columns.length >= 4) {
      //year ended
      if (assignments.length > 0)
        years.push(assignments);
      assignments = [];
    }
  })
  return years;
}


async function getPreviousYearsFinalLetterGrades(email, pass, schoolDomain) {
  email = encodeURIComponent(email);
  pass = encodeURIComponent(pass);
  const signInInfo = await openAndSignIntoGenesis(email, pass, schoolDomain)
  const cookieJar = signInInfo.cookie
  //Verify Sign in was successful
  if (!signInInfo.signedIn) {
    console.log("BAD user||pass")
    return { Status: "Invalid" };
  }

  const url3 = getSchoolUrl(schoolDomain, "main") + "?tab1=studentdata&tab2=grading&tab3=history&action=form&studentid=" + getIdFromSignInInfo(signInInfo);
  const classGradesPage = await openPage(cookieJar, url3, signInInfo.userAgent)

  let classGrades = await scrapeClassGrades($.load(classGradesPage))

  for (var yr in classGrades) {
    var yrData = classGrades[yr]
    for (var classIndex in yrData) {
      const weightFromFunc = findWeight(classGrades[yr][classIndex]["Name"])
      if (weightFromFunc)
        classGrades[yr][classIndex]["Weight"] = weightFromFunc
      if (!classGrades[yr][classIndex]["Weight"]) {
        //console.log("ERR"+classGrades[yr][classIndex]["Name"]+"not found!")
        db.collection('errors').doc("Unknown Classes").update({
          err: admin.firestore.FieldValue.arrayUnion(classGrades[yr][classIndex]["Name"]),
        })
      }
    }
  }
  console.log("Grades gotten for: " + email)
  return classGrades
}


async function scrapeCurrentClassGrades($) {
  //require('fs').writeFileSync('debug.html', $.html());
    const headingNodes = $(".listheading>.cellLeft")
    const columnsToRead = ["MP1", "MP2", "ME", "MP3", "MP4", "FE", "S1", "FG", "EARNED", "ATT.", "COURSE"].map(header => ({
      header,
      index: headingNodes.index($(`.list td:icontains("${header}")`))//node => node.innerText && node.innerText.toUpperCase() == header)
    }))
    const assignments = [];
    $(`.list>tbody>tr`).each((i,el)=>{
      const columns = $("td",el)
      const rowClass = $(el).attr('class')
      if (rowClass && !rowClass.includes("listheading") && columns.length > 8) {
        const assignData = {};
        const earnedIndex = columnsToRead.find(el => el.header == "EARNED").index
        if (!Number(columns.eq(earnedIndex).text()))
          assignData["Credits"] = Number(columns.eq(columnsToRead.find(el => el.header == "ATT.").index).text())
        else
          assignData["Credits"] = Number(columns.eq(earnedIndex).text())
        columnsToRead.filter(el => el.index != -1 && ["MP1", "MP2", "ME", "MP3", "MP4", "FE", "S1", "FG"].includes(el.header)).forEach((column) => {
          const columnText = columns.eq(column.index).text().trim().split("\n")[0]
          if (columnText)
            assignData[column.header] = columnText
        })
        assignData["Name"] = columns.eq(columnsToRead.find(el => el.header == "COURSE").index).text().trim().replace(/\s+/g, ' ');
        console.log(`${assignData["Name"]}: ${columns.length}`)
        assignments.push(assignData);
      }
    })
    return assignments;
}


async function getThisYearsMPLetterGrades(email, pass, schoolDomain) {
  email = encodeURIComponent(email);
  pass = encodeURIComponent(pass);

  const signInInfo = await openAndSignIntoGenesis(email, pass, schoolDomain)
  const cookieJar = signInInfo.cookie
  //Verify Sign in was successful
  if (!signInInfo.signedIn) {
    console.log("BAD user||pass")
    return { Status: "Invalid" };
  }

  const url3 = getSchoolUrl(schoolDomain, "main") + "?tab1=studentdata&tab2=grading&tab3=current&action=form&studentid=" + getIdFromSignInInfo(signInInfo);
  //console.log(url3)
  //require('fs').writeFileSync('debug.html', signInInfo.$.html());
  const classGradesPage = await openPage(cookieJar, url3, signInInfo.userAgent)
  //CHECK IF AUP IS DONE
  //await page.evaluate(()=>document.getElementById("dialog-system_clientMessage").innerText.includes("restore access"))
  let classGrades = await scrapeCurrentClassGrades($.load(classGradesPage))
  for (var classIndex in classGrades) {
    if (findWeight(classGrades[classIndex]["Name"]))
      classGrades[classIndex]["Weight"] = findWeight(classGrades[classIndex]["Name"])
    if (!classGrades[classIndex]["Weight"]) {
      //console.log("ERR"+classGrades[yr][classIndex]["Name"]+"not found!")
      db.collection('errors').doc("Unknown Classes").update({
        err: admin.firestore.FieldValue.arrayUnion(classGrades[classIndex]["Name"]),
      })
    }
  }

  console.log("Grades gotten for: " + email)
  return classGrades
}

function notify(tokens, title, subtitle, body, data) {
  console.log("Testing notifications")
  console.log(tokens)
  let messages = [];
  for (let pushToken of tokens) {
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`Push token ${pushToken} is not a valid Expo push token`);
      continue;
    }
    // Construct a message (see https://docs.expo.io/versions/latest/guides/push-notifications.html)
    messages.push({
      to: pushToken,
      sound: 'default',
      priority: 'high',
      title: title,
      subtitle: subtitle,
      body: body,
      data: data,
    })
  }
  console.log(messages)
  let chunks = expo.chunkPushNotifications(messages);
  (async () => {
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log("Sent chunk")
      } catch (error) {
        console.error(error);
      }
    }
  })();
}




//SEND OUT EMAILS TO PEOPLE
/*
        var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'gradeviewapp@gmail.com',
    pass: ''//School password
  }
});

db.collection('userEmails').doc("emailList").get().then(doc => {
  console.log(doc.data()["emails"]);
  var emails = ['10020691@sbstudents.org','10014547@sbstudents.org'];

  for(thingToDelete of doc.data()["emails"]){
    while(emails.indexOf(thingToDelete)!=-1){
      emails.splice(emails.indexOf(thingToDelete),1)
    }
  }


  setInterval(()=>{
    email = emails[0]
    while(emails.indexOf(email)!=-1){
      emails.splice(emails.indexOf(email),1)
    }
    var mailOptions = {
      from: 'gradeviewapp@gmail.com',
      to: email,
      subject: `GradeView - The Long Awaited Update`,
      html: `<h4>Hello!</h4><br/>
      Let me start with: <strong><a href="http://gradeview.kihtrak.com">GRADEVIEW</a> IS BACK</strong>.<br/><br/>
      I’ve talked to Mr. Varela twice in person and sent him an email which he forwarded to the district technology supervisor. In both the in-person meetings and the emails, I asked if I had broken any school policies or Genesis terms of service. I have still not been informed of any violations and Mr. Varela stopped responding to my emails. It has been over 3 weeks and I have sent 2 follow-up emails. At this point in time, I’m assuming that no rules have been broken. As such, GradeView will resume full functionality until I get a response.<br/><br/>
      Thank you!<br/><br/><br/><br/><br/>
      You are receiving this email because you asked to be notified about updates to the GradeView app`
    };

    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: '+email+" ; Info:" + info.response);
      }
    });

  },10000)
})
*/
