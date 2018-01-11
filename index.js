require('dotenv').config();
const Stream = require('user-stream');
const SlackBot = require('slackbots');
const chalk = require('chalk');
const figlet = require('figlet');
const config = require('./config.json');
const getUrls = require('get-urls');
const moment = require('moment');
const log = console.log;
let output = {};

const stream = new Stream({
  consumer_key: process.env.consumer_key,
  consumer_secret: process.env.consumer_secret,
  access_token_key: process.env.access_token_key,
  access_token_secret: process.env.access_token_secret
});

const bot = new SlackBot({
  token: process.env.slack_token,
  name: config.slack.name
});

welcome();

function welcome() {
  console.log(chalk.yellow(figlet.textSync('snkrTwttr v2', { horizontalLayout: 'full' })));

  log(chalk.blue.bgBlack(`-------------------------`));
  log(chalk.blue.bgBlack(`MONITORING THESE ACCOUNTS`));
  log(chalk.blue.bgBlack(`-------------------------`));
  config.data.accountsToTrack.forEach(account => log(`@${account}`));

  if (config.slack.sendDM) {
    log(chalk.blue.bgBlack(`------------------------------`));
    log(chalk.blue.bgBlack(`NOTIFYING THESE SLACK ACCOUNTS`));
    log(chalk.blue.bgBlack(`------------------------------`));
    config.slack.users.forEach(user => log(`${user}`));
  }

  log(chalk.red.bgBlack(`-------------------`));
  log(chalk.red.bgBlack(`FOUND THESE TWEETS:`));
  log(chalk.red.bgBlack(`-------------------`));
}

const keywords = config.data.keywords.join(', ');

if (config.data.useKeywords) {
  log(chalk.red.bgBlack(`Monitoring tweets containing => ${keywords}`));
}

bot.on('start', function() {
  bot.postMessageToChannel(
    config.slack.channelName,
    `🤖 Monitoring => ${config.data.accountsToTrack.map(e => `@${e}`).join(', ')}!`,
    {
      icon_url: config.slack.icon
    }
  );
});

const params = {
  track: config.data.keywords.join(',')
};

stream.stream(config.data.useKeywords && params);

// connected to stream
stream.on('connected', function() {
  log('Stream connected!');
});

stream.on('data', function(data) {
  config.data.accountsToTrack.forEach(account => {
    if (account == data.user.screen_name) {
      output.screen_name = data.user.screen_name;
      output.id = data.id;

      // tweet text
      if (data.extended_tweet.full_text.length >= data.text.length) {
        output.text = data.extended_tweet.full_text;
      } else {
        output.text = data.text;
      }

      output.text = output.text
        .split(' ')
        .map(e => e.replace(/(\r\n|\n|\r)/gm, ' ').trim() + ' ')
        .join('');

      // grab urls from tweet
      const urls = getUrls(output.text);
      const myLinks = Array.from(urls);
      const tweetLink = myLinks[urls.size - 1];
      output.tweetLink = tweetLink;
      output.media = data.extended_tweet.extended_entities.media[0].media_url_https;

      newSlackMessage(output);
    }
  });
});

function newSlackMessage(data) {
  const { screen_name, tweetLink, text, id, media } = data;
  const now = moment().format('MMMM Do YYYY, h:mm:ss a');
  log(chalk.red.bgBlack.bold(`New update (${id}) from @${screen_name} on ${now}`));

  const params = {
    icon_url: config.slack.icon,
    attachments: [
      {
        title: `New update from @${screen_name}`,
        title_link: tweetLink,
        author_name: `@${screen_name}`,
        author_link: `https://twitter.com/${screen_name}`,
        color: config.slack.color,
        image_url: media ? media : '',
        ts: Math.floor(Date.now() / 1000),
        fields: [
          {
            value: text,
            short: 'false'
          }
        ],
        footer: config.slack.name,
        footer_icon: config.slack.footer_icon
      }
    ]
  };

  // send to channel
  if (config.slack.sendToChannel) {
    bot.postMessageToChannel(config.slack.channelName, null, params);
  }

  // send DM
  if (config.slack.sendDM) {
    config.slack.users.forEach(user => bot.postMessageToUser(user, null, params));
  }
}

// error with stream
stream.on('error', function(error) {
  log('Connection error:');
  log('------------------');
  log(error);
});

// stream closed
stream.on('close', function(error) {
  log('Stream closed');
  log('------------------');
  log(error);
});
