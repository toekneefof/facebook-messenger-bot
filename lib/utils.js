const fs = require('fs');
const _ = require('lodash');
const config = require('../config.json');

const PAUSE_TIMER = config.chat.pauseTimer;

const URL_API_FAN_DUEL = 'https://api.fanduel.com';
// api.openweathermap.org/data/2.5/forecast/city?id=524901&APPID=1111111111
let pausedUntil = Date.now();

const self = module.exports = {
  readAppState: () => _.attempt(() => JSON.parse(fs.readFileSync('app-state.json', 'utf8'))),
  writeAppState: (appState) => {
    fs.writeFileSync('app-state.json', JSON.stringify(appState, null, '\t'), 'utf8');
  },
  sleep: (s) => {
    const numSecs = _.toNumber(s);
    if (_.isNumber(numSecs)) {
      pausedUntil += (numSecs * 1000);
    }
  },
  getCmd: (body) => {
    let cmd;
    if (_.startsWith(body, '/')) {
      const idx = body.indexOf(' ');
      if (idx > -1) {
        cmd = _.lowerCase(body.substring(1, idx));
      } else {
        cmd = body.substring(1);
      }
      console.log(`[${cmd}] cmd received`);
    }
    return cmd;
  },
  getSubCmd: (cmd, event) => {
    const result = _.attempt(() => {
      let subCmd;
      if (cmd === 'fanduel') {
        const params = event.body.split(/\s/).splice(1);
        subCmd = _.lowerCase(params[0]);
      } else if (cmd === 'countdown') {
        subCmd = _.camelCase(event.body.split('/countdown').splice(1).toString());
      } else if (cmd === 'kick') {
        subCmd = _.lowerCase(event.body.split('/kick').splice(1).toString());
      } else if (cmd === 'jerbonics') {
        subCmd = _.lowerCase(event.body.split('/jerbonics')[1].split(' ')[1].toString());
      } else if (cmd === 'weather' || cmd === 'trump') {
        subCmd = _.words(event.body)[1];
      }
      console.log(`[${cmd}] subCmd: ${subCmd}`);
      return subCmd;
    });
    if (_.isError(result)) {
      console.error(`[${cmd}] failed to getSubCmd from: ${event.body}`);
    }
    return result;
  },
  canRespond: (cmd, event) => {
    if (_.isString(cmd)) {
      const now = parseInt(event.timestamp, 10);
      if (now > pausedUntil) {
        pausedUntil = Date.now() + PAUSE_TIMER;
        return true;
      }
      console.error(`[${cmd}] skipping, cooldown remaining [${now - pausedUntil}]`);
    }
    return false;
  },
  canAutoRespond: (event, phrase) =>
    event.body && _.words(_.lowerCase(event.body)).indexOf(phrase) > -1
    && config.facebook.threadIds.indexOf(event.threadID) > -1
    && event.senderID !== config.facebook.userId.tonyBot,
  getFanDuelBaseUrl: (event) => {
    const cmdArray = event.body.split(/\s/);
    if (cmdArray.length === 3) {
      const contestId = cmdArray.splice(1)[1];
      if (contestId && (contestId.indexOf('-') > -1)) {
        config.fanDuel.contest.id = contestId;
        // fs.writeFileSync('../config.json', JSON.stringify(config, null, '\t'), 'utf8');
      }
    }
    return `${URL_API_FAN_DUEL}/contests/${config.fanDuel.contest.id}`;
  },
  getFanDuelRankChar: (rank) => {
    if (rank === 1) {
      return '\ud83c\udfc6';
    }
    return `[${rank}]`;
  },
  getFanDuelLeaderboard: (json) => {
    const scores = [];
    json.rosters.forEach((roster) => {
      const result = {};
      /* eslint-disable no-underscore-dangle */
      const userId = roster._url.split(`${URL_API_FAN_DUEL}/users/`)[1].split('/')[0];
      /* eslint-enable no-underscore-dangle */
      result.user = config.fanDuel.userIdToName[userId];
      result.score = roster.score;
      result.ppr = roster.ppr;
      scores.push(result);
    });
    let msg = `${json.contests[0].name}\u000A--\u000A`;
    const results = _.orderBy(scores, 'score', 'desc');
    let rank = 0;
    results.forEach((result) => {
      const msgRank = self.getFanDuelRankChar(rank += 1);
      msg += `${msgRank} ${result.user}: ${result.score} (${result.ppr})\u000A`;
    });
    return msg;
  },
  checkPresence: (chat, event) => {
    if (event.threadID && config.facebook.threadIds.indexOf(event.threadID) > -1) {
      chat.getThreadInfo(event.threadID, (getThreadErr, info) => {
        if (getThreadErr) {
          console.error(getThreadErr);
        } else if (info) {
          const userIds = config.facebook.userId;
          const pIds = info.participantIDs;
          if (pIds.indexOf(userIds.tonyBot) === -1
          || pIds.indexOf(userIds.tony) === -1) {
            console.log(`re-adding tonys for ${event.threadID}`);
            chat.addUserToGroup(userIds.tonyBot, event.threadID);
            chat.addUserToGroup(userIds.tony, event.threadID);
          }
        }
      });
    }
  },
  getWeather: json =>
    `Weather in ${json.name}\u000AHumidity: ${json.main.humidity}\u000ACurrent Temp: ${json.main.temp} (${json.weather[0].main})\u000AHigh/Low Temp: ${json.main.temp_max}/${json.main.temp_min}`
  ,
};