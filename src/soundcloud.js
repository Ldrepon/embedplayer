(function ($, undefined) {
	"use strict";

	function asyncCall (self,data,method,callback) {
		if (method in data.detail.callbacks) {
			data.detail.callbacks[method].push(callback);
		}
		else {
			data.detail.callbacks[method] = [callback];
		}
		send(self,data,method);
	}

	var event_map = {
		ready: 'ready',
		play: 'play',
		pause: 'pause',
		finish: 'finish',
		buffering: null,
		timeupdate: 'playProgress',
		durationchange: 'loadProgress',
		volumechange: null
	};

	$.embedplayer.register({
		origin: ['https://w.soundcloud.com','http://w.soundcloud.com'],
		matches: function () {
			return $.nodeName(this,"iframe") && /^https?:\/\/w\.soundcloud\.com\/player\/\?/i.test(this.src);
		},
		init: function (data,callback) {
			var match = /^https?:\/\/w\.soundcloud\.com\/player\/\?(.*)/i.exec(this.src);
			var params = $.embedplayer.parseParams(match[1]);
			match = /^https?:\/\/api\.soundcloud\.com\/([a-z]+)\/(\d+)/i.exec(params.url);

			data.detail.item_type = match[1];
			data.detail.item_id = match[2];
			data.detail.duration = NaN;
			data.detail.currenttime = NaN;
			data.detail.commands = [];
			data.detail.origin = $.embedplayer.origin(this.src);
			data.detail.callbacks = {};

			var self = this;
			$(window).on('message', onmessage);
			function onmessage (event) {
				var raw = event.originalEvent;
				if (self.contentWindow && raw.origin === data.detail.origin && self.contentWindow === raw.source) {
					var message = data.module.parseMessage(raw);
					if (message.data.method === "ready") {
						data.detail.widget_id = message.data.widgetId;
						callback(message.player_id);
						$.embedplayer.trigger(self,data,"ready");
						$(window).off('message', onmessage);
						// initialize some data
						send(self,data,'getDuration');
						send(self,data,'getVolume');
						for (var i = 0; i < data.detail.commands.length; ++ i) {
							self.contentWindow.postMessage(JSON.stringify(data.detail.commands[i]),data.detail.origin);
						}
						data.detail.commands = null;
					}
				}
				else if (!$.contains(self.ownerDocument.body, self)) {
					$(window).off('message', onmessage);
				}
			}
		},
		play: function (data) {
			send(this,data,"play");
		},
		pause: function (data) {
			send(this,data,"pause");
		},
		stop: function (data) {
			send(this,data,"pause");
		},
		volume: function (data,callback) {
			asyncCall(this,data,"getVolume",function (volume) {
				callback(volume/100);
			});
		},
		duration: function (data,callback) {
			asyncCall(this,data,"getDuration",function (duration) {
				callback(duration/1000);
			});
		},
		currenttime: function (data,callback) {
			asyncCall(this,data,"getPosition",function (position) {
				callback(position/1000);
			});
		},
		setVolume: function (data,volume) {
			send(this,data,'setVolume',volume*100);
		},
		seek: function (data,position) {
			send(this,data,'seekTo',position*1000);
		},
		listen: function (data,events) {
			var done = {};
			for (var i = 0; i < events.length; ++ i) {
				var event = event_map[events[i]];
				if (event && done[event] !== true) {
					done[event] = true;
					send(this,data,'addEventListener',event);
				}
			}
		},
		link: function (data) {
			return null; // TODO
		},
		parseMessage: function (event) {
			var message = {
				data: JSON.parse(event.data)
			};
			message.player_id = "soundcloud_"+message.data.widgetId;
			return message;
		},
		processMessage: function (data,message,trigger) {
			if (message.data.method === "playProgress") {
				var currenttime = message.data.value.currentPosition/1000;
				if (currenttime !== data.detail.currenttime) {
					data.detail.currenttime = currenttime;
					trigger('timeupdate',{currentTime:currenttime});
				}
			}
			else if (message.data.method === "play") {
				trigger("play");
			}
			else if (message.data.method === "pause") {
				trigger("pause");
			}
			else if (message.data.method === "finish") {
				trigger("finish");
			}
			else if (message.data.method) {
				var callbacks = data.detail.callbacks[message.data.method];
				if (callbacks) {
					for (var i = 0; i < callbacks.length; ++ i) {
						callbacks[i].call(this,message.data.value);
					}
					data.detail.callbacks[message.data.method] = null;
				}
				if (message.data.method === "getVolume") {
					trigger("volumechange",{volume:message.data.value});
				}
				else if (message.data.method === "getDuration") {
					trigger("durationchange",{duration:message.data.value});
				}
			}
		}
	});

	function send (element,data,method,value) {
		var command = {
			method: method
		};

		if (arguments.length > 3) {
			command.value = value;
		}

		if (data.state === "init") {
			data.detail.commands.push(command);
		}
		else {
			var win = element.contentWindow;
			if (win) {
				win.postMessage(JSON.stringify(command),data.detail.origin);
			}
		}
	}
})(jQuery);