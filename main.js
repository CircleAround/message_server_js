var host = 'https://message-server-app.herokuapp.com';
var endpoint = host + '/api';

// 通信を司るコネクタ
var Connector = function() {

  function request(params) {
    params['dataType'] = 'json';
    return $.ajax(params);
  }

  function url(path) {
    return endpoint + path;
  }

  function Connector(){}

  Connector.prototype.signup = function (email) {
    return request({
      type: 'post',
      url: url('/sign_up'),
      data: {
        registration: {
          email: email
        }
      }
    });
  }

  Connector.prototype.login = function (email) {
    return request({
      type: 'post',
      url: url('/login'),
      data: {
        registration: {
          email: email
        }
      }
    });
  }

  Connector.prototype.getAllMessages = function (user){
    return request({
      type: 'get',
      url: url('/messages'),
      headers: {
        Authorization: user.token
      }
    });
  }

  Connector.prototype.deleteMessage = function(user, message) {
    return request({
      type: 'delete',
      url: url('/messages/' + message.id),
      headers: {
        Authorization: user.token
      }
    });
  }

  Connector.prototype.postMessage = function(user, message) {
    return this.saveMessage('post', url('/messages'), user, message);
  }

  Connector.prototype.putMessage = function(user, message) {
    return this.saveMessage('put', url('/messages/' + message.id), user, message);
  }

  Connector.prototype.saveMessage = function(method, url, user, message) {
    return request({
      type: method,
      url: url,
      data: {
        message: {
          contents: message.contents
        }
      },
      headers: {
        Authorization: user.token
      }
    });
  }

  return Connector;
}();

// データが変更されたらイベントリスナを叩くオブザーバー。
var MessageService = function () {

  function MessageService(connector) { 
    this.connector = connector;
    this.targetMessage = null;

    this.onError = function(err, t, s){
      console.err(err, t, s)
    }

    this.onSignUp = function() {}
    this.onLoggedIn = function() {} 
    this.onChangeMessages = function() {}
    this.onChangeTargetMessage = function() {}
  }

  MessageService.prototype.signup = function (email) {
    var _this = this;
    return this.handleError(this.connector.signup(email).then(function(data){
      _this.user = data;
      _this.onSignUp();
    }));
  }

  MessageService.prototype.login = function (email) {
    var _this = this;
    return this.handleError(this.connector.login(email).then(function(data){
      _this.user = data;
      _this.onLoggedIn();
    }));
  }

  MessageService.prototype.getAllMessages = function (){
    var _this = this;

    return this.handleError(this.connector.getAllMessages(this.user).then(function(data){
      _this.messages = data;
      _this.onChangeMessages();
    }));
  }

  MessageService.prototype.postMessage = function() {
    var _this = this;
    var message = this.targetMessage;
    return this.handleError(this.connector.postMessage(this.user, message).then(function(data){
      _this.messages.unshift(data);
      _this.onChangeMessages();
    }));
  }

  MessageService.prototype.putMessage = function() {
    var _this = this;
    var message = this.targetMessage;
    return this.handleError(this.connector.putMessage(this.user, message).then(function(data){
      var msg = _this.messages.find(function(m){ return m.id === message.id });
      _this.message = Object.assign(msg, message);
      _this.onChangeMessages();
    }));
  }

  MessageService.prototype.deleteMessage = function(message) {
    var _this = this;
    return this.handleError(this.connector.deleteMessage(this.user, message).then(function(data){
      var at = _this.messages.indexOf(message);
      _this.messages.splice(at, 1);
      _this.onChangeMessages();
    }));
  }

  MessageService.prototype.setTargetMessage = function(message) {
    this.targetMessage = message;
    this.onChangeTargetMessage();
  }

  MessageService.prototype.isEdit = function() {
    return this.targetMessage && this.targetMessage.id
  }

  MessageService.prototype.handleError = function(promise){
    var _this = this;
    return promise.catch(function(xhr, t, s){
      if (xhr.status === 200) {
        throw new Error('catched but status 200');
      }

      var e = new Error((xhr.status === 0) ? 'net work not connected': JSON.parse(xhr.responseText).error);
      _this.onError(e, xhr, t, s);

      throw e;
    });
  }

  return MessageService;
}();


// このスコープでしかUIには触りません。
var MessageView = function(){
  function MessageView($el, service) {
    this.$el = $el;
    this.service = service;

    // 行数の多いJavaScriptはHTMLのテンプレートで作ります。
    this.loginPanelTemplate = $('#login_panel_template').text();
    this.messagePanelTemplate = $('#message_panel_template').text();
    this.messageTemplate = $('#message_template').text();
  }

  MessageView.prototype.init = function() {
    var _this = this;
    this.find('.host').text(host).attr('href', host);

    this.service.onError = function(err, t, s) {
      _this.showAlert(err.message, 'error');
    }

    this.initAuthenticationPanel();
  }

  MessageView.prototype.find = function(params) {
    return this.$el.find(params);
  }

  MessageView.prototype.updateUser = function(user){
    this.find('.user_email').text(user.email);
  }

  MessageView.prototype.updateMessages = function(messages) {
    var _this = this;
    var $messages = $('<div></div>', {class: 'messages'});
    messages.forEach(function(message){
      var $message = $(_this.messageTemplate).appendTo($messages);
      $message.find('.contents').text(message.contents);
      $message.find('.user>.id').text(message.user_id);
      $message.find('.edit').click(function(){
        _this.service.setTargetMessage(message);
      });
      $message.find('.delete').click(function(){
        _this.service.deleteMessage(message).then(function(){
          _this.showAlert('削除しました');
        }, function(e){
          _this.showAlert('削除失敗しました: ' + e.message);
        })
      })
    });

    this.find('.messages').replaceWith($messages);    
  }

  MessageView.prototype.updateForm = function() {
    var $form = this.find('.message_form');
    if (this.service.isEdit()) {
      var message = this.service.targetMessage;
      $form.find('.contents').val(message.contents);
    } else {
      $form.find('.contents').val('');
    }
  }

  MessageView.prototype.showAlert = function(message, type){
    type = type || 'info';
    var  $alert = this.find('.alert');
    var $msg = $('<div></div>', {text: message, class: "item " + type}).appendTo($alert);
    setTimeout(function(){
      $msg.fadeOut(1000, function(){
        $msg.remove();
      });
    }, 2000);
  }

  MessageView.prototype.overlay = function($target)  {
    var $overlay = $('<div></div>', {class: 'overlay'}).appendTo($target);
    $('<div></div>', {class: 'point', text: '情報取得中...'}).appendTo($overlay);
    return function() {
      $overlay.remove();
    }
  }

  MessageView.prototype.authenticate = function(email, method, message){
    var _this = this;
    var closeLogin = this.overlay(this.$el);

    this.service[method](email).always(function(){
      _this.showAlert(message)
      closeLogin();
    }).then(function(){
      _this.initMessagePanel();
  
      var close = _this.overlay(_this.find('.messages'));
      _this.service.getAllMessages().always(function(){
        close();
      })
    });
  }

  MessageView.prototype.signup = function(email){
    this.authenticate(email, 'signup', 'ようこそ'  + email + 'さん。新たにユーザー作成しました');
  }

  MessageView.prototype.login = function(email){
    this.authenticate(email, 'login', 'ようこそ'  + email + 'さん。無事にログインしました');
  }

  MessageView.prototype.initAuthenticationPanel = function(){
    var _this = this;

    this.find('.content_wrapper').replaceWith(this.loginPanelTemplate);
    
    var $loginForm = this.find('.login_form');
    $loginForm.find('button').click(function(){
      _this.login($loginForm.find('input').val());
    });

    this.service.onLoggedIn = function(){
      _this.updateUser(_this.service.user);
    }

    var $signupForm = this.find('.signup_form');
    $signupForm.find('button').click(function(){
      _this.signup($signupForm.find('input').val());
    });

    this.service.onSignUp = function(){
      _this.updateUser(_this.service.user);
    }
  }

  MessageView.prototype.initMessagePanel = function(){
    var _this = this;

    this.find('.content_wrapper').replaceWith(this.messagePanelTemplate);
    this.find('button').click(function(){
      var $contents = _this.find('textarea.contents');

      if (_this.service.isEdit()) {
        _this.service.targetMessage.contents = $contents.val();
        _this.service.putMessage().then(function(){
          _this.showAlert('更新成功');
          _this.service.setTargetMessage(null);
        }, function(e){
          _this.showAlert('更新失敗', + e.message, 'error');
        })
      } else {
        _this.service.setTargetMessage({
          contents: $contents.val()
        });
        _this.service.postMessage().then(function(){
          _this.showAlert('投稿成功');
          _this.service.setTargetMessage(null);
        }, function(e){
          _this.showAlert('投稿失敗', + e.message, 'error');
        });
      }
    });

    this.service.onChangeMessages = function() {
      _this.updateMessages(_this.service.messages)
    };

    this.service.onChangeTargetMessage = function() {
      _this.updateForm();
    };
  };

  return MessageView;
}();

// エントリポイント
$(function () {
  var messageService = new MessageService(new Connector());
  var messageView = new MessageView($('#message-component'), messageService);

  messageView.init();
});