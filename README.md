# GradeView
Server side code for the [GradeView App](https://github.com/KihtrakRaknas/GradeViewApp/) to handle API reqests

## Installation
Install all npm packages like so
```bash
npm install
```
Then start the server with
```bash
npm start
```

## Maintenance
The app calculates weighted GPA. For this to work the server must know the weightings of different classes. This information is available online. It has been scraped and stored in the *classWeightingOutput.json* file.
To generate a new up-to-date *classWeightingOutput.json* file run:
```bash
node courseWeight.js
```
(Make sure you have already done `npm install`)
