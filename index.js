var _ = require('underscore');
_.mixin( require('underscore.deferred') );
var inflection = require('inflection');
var Twit = require('twit');
var T = new Twit(require('./config.js'));
var wordfilter = require('wordfilter');
var ent = require('ent');
var pos = require('pos');
var wordnikKey = require('./permissions.js').key;
var request = require('request');

Array.prototype.pick = function() {
  return this[Math.floor(Math.random()*this.length)];
};

Array.prototype.pickRemove = function() {
  var index = Math.floor(Math.random()*this.length);
  return this.splice(index,1)[0];
};

function getNouns(words) {
  var nouns = [];
  // accepts an array of words
  words = new pos.Lexer().lex(words.join(' '));
  var taggedWords = new pos.Tagger().tag(words);
  for (var i=0;i<taggedWords.length;i++) {
    var taggedWord = taggedWords[i];
    var word = taggedWord[0];
    var tag = taggedWord[1];
    console.log(word, tag, tag.length, tag==='NN');
    if (tag === 'NN' || tag === 'NNS') {
      nouns.push(word);
    }
  }
  return nouns;
}

function search(term) {
  var dfd = new _.Deferred();
  //dfd.resolve(['a']);
  //return dfd.promise();
  T.get('search/tweets', { q: term, count: 100 }, function(err, reply) {
    var tweets = reply.statuses;
    tweets = _.chain(tweets)
      .map(function(el) {
        var obj = {};
        if (el.retweeted_status) {
          obj.text = ent.decode(el.retweeted_status.text);
        }
        else {
          obj.text = ent.decode(el.text);
        }
        obj.id_str = el.id_str;
        obj.screen_name = el.user.screen_name;
        return obj;
      })
      .map(function(el) {
        var reg = new RegExp('.*'+term.replace(/"/g,''),'i');
        el.text = el.text.replace(reg,'').replace(/[\.\?!].*/,'');
        return el;
      })
      .reject(function(el) {
        // filtering out substring of "Antarctica" because of a stupid song lyric
        return (el.text.indexOf('#') > -1 || el.text.indexOf('http') > -1 || el.text.indexOf('@') > -1 || el.text.indexOf('"') > -1 || el.text.indexOf(':') > -1 || el.text.length > 25);
      })
      .uniq()
      .value();
    dfd.resolve(tweets);
  });
  return dfd.promise();
}

function getRhymes(word) {
  var dfd = new _.Deferred();
  var url = 'http://api.wordnik.com:80/v4/word.json/' + word + '/relatedWords?useCanonical=false&relationshipTypes=rhyme&limitPerRelationshipType=100&api_key=' + wordnikKey;
  request(url, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var result = JSON.parse(body);
      // parse stuff and resolve\n' +
      dfd.resolve(result);
    }
    else {
      dfd.reject();
    }
  });
  return dfd.promise();
}

function generate() {
  var dfd = new _.Deferred();
  _.when(
    search('"i wish i had a"')
    ).done( function(res1) {
      console.log(res1);
      var result = res1.pick();
      var tweet = result.text;
      var user = result.screen_name;
      var id_str = result.id_str;
      //tweet = 'good team in COD on PS4';
      var words = tweet.split(' ');
      words = _.reject(words, function(el) {
        return el.length < 3;
      });
      console.log(words);
      var nouns = getNouns(words);
      console.log(nouns);
      var noun = nouns.pick();
      console.log('trying to rhyme', noun);

      getRhymes(noun).done(function(res) {
        console.log(typeof res, res[0].words.length);
        var rhyme = res[0].words.pick();
        var response = [
          'What was that? Oh. One THING, coming right up!',
          'I\'m sorry, I wasn\'t listening. Here\'s the THING you asked for.',
          'Huh? A THING? Why would you--well it\'s not up to me to ask. Granted.',
          'Look I\'m a very busy genie but sure, have a THING, why not.'
        ].pick().replace('THING', tweet.replace(noun, rhyme).trim());
        var finalTweet = response + ' http://twitter.com/' + user + '/status/' + id_str;
        dfd.resolve(finalTweet);
      });
    });
  return dfd.promise();
}

function tweet() {
  generate().then(function(myTweet) {
    if (!wordfilter.blacklisted(myTweet)) {
      console.log(myTweet);
      T.post('statuses/update', { status: myTweet }, function(err, reply) {
        if (err) {
          console.log('error:', err);
        }
        else {
          console.log('reply:', reply);
        }
      });
    }
  });
}

// Tweet once on initialization
tweet();
