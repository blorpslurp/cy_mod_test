var ChannelModule = require("./module");
var User = require("../user");

const DEFAULT_PERMISSIONS = {
    seeplaylist: -1,          // See the playlist
    playlistadd: 2,         // Add video to the playlist
    playlistnext: 2,        // Add a video next on the playlist
    playlistmove: 18,        // Move a video on the playlist
    playlistdelete: 20,        // Delete a video from the playlist
    playlistjump: 18,        // Start a different video on the playlist
    playlistaddlist: 20,     // Add a list of videos to the playlist
    oplaylistadd: -1,         // Same as above, but for open (unlocked) playlist
    oplaylistnext: 2,
    oplaylistmove: 18,
    oplaylistdelete: 20,
    oplaylistjump: 18,
    oplaylistaddlist: 19,
    playlistaddcustom: 30,     // Add custom embed to the playlist
    playlistaddrawfile: 25,    // Add raw file to the playlist
    playlistaddlive: 25,     // Add a livestream to the playlist
    exceedmaxlength: 16,       // Add a video longer than the maximum length set
    addnontemp: 26,            // Add a permanent video to the playlist
    settemp: 26,               // Toggle temporary status of a playlist item
    playlistshuffle: 20,       // Shuffle the playlist
    playlistclear: 26,         // Clear the playlist
    pollctl: 19,             // Open/close polls
    pollvote: -1,             // Vote in polls
    viewhiddenpoll: 19,      // View results of hidden polls
    voteskip: 1,             // Vote to skip the current video
    viewvoteskip: 19,        // View voteskip results
    mute: 20,                // Mute other users
    kick: 20,                // Kick other users
    ban: 26,                   // Ban other users
    motdedit: 36,              // Edit the MOTD
    filteredit: 36,            // Control chat filters
    filterimport: 36,          // Import chat filter list
    emoteedit: 36,             // Control emotes
    emoteimport: 36,           // Import emote list
    playlistlock: 20,          // Lock/unlock the playlist
    leaderctl: 20,             // Give/take leader
    drink: 40,               // Use the /d command
    chat: 0,                  // Send chat messages
    chatclear: 20,             // Use the /clear command
    exceedmaxitems: 17,        // Exceed maximum items per user limit
    deletefromchannellib: 20,  // Delete channel library items
    exceedmaxdurationperuser: 16 // Exceed maximum total playlist length per user
};

function PermissionsModule(_channel) {
    ChannelModule.apply(this, arguments);
    this.permissions = {};
    this.openPlaylist = false;
    this.supportsDirtyCheck = true;
}

PermissionsModule.prototype = Object.create(ChannelModule.prototype);

PermissionsModule.prototype.load = function (data) {
    this.permissions = {};
    var preset = "permissions" in data ? data.permissions : {};
    for (var key in DEFAULT_PERMISSIONS) {
        if (key in preset) {
            this.permissions[key] = preset[key];
        } else {
            this.permissions[key] = DEFAULT_PERMISSIONS[key];
        }
    }

    if ("openPlaylist" in data) {
        this.openPlaylist = data.openPlaylist;
    } else if ("playlistLock" in data) {
        this.openPlaylist = !data.playlistLock;
    }

    this.dirty = false;
};

PermissionsModule.prototype.save = function (data) {
    data.permissions = this.permissions;
    data.openPlaylist = this.openPlaylist;
};

PermissionsModule.prototype.hasPermission = function (account, node) {
    if (account instanceof User) {
        account = account.account;
    }

    if (node.indexOf("playlist") === 0 && this.openPlaylist &&
        account.effectiveRank >= this.permissions["o"+node]) {
        return true;
    }

    return account.effectiveRank >= this.permissions[node];
};

PermissionsModule.prototype.sendPermissions = function (users) {
    var perms = this.permissions;
    if (users === this.channel.users) {
        this.channel.broadcastAll("setPermissions", perms);
    } else {
        users.forEach(function (u) {
            u.socket.emit("setPermissions", perms);
        });
    }
};

PermissionsModule.prototype.sendPlaylistLock = function (users) {
    if (users === this.channel.users) {
        this.channel.broadcastAll("setPlaylistLocked", !this.openPlaylist);
    } else {
        var locked = !this.openPlaylist;
        users.forEach(function (u) {
            u.socket.emit("setPlaylistLocked", locked);
        });
    }
};

PermissionsModule.prototype.onUserPostJoin = function (user) {
    user.socket.on("setPermissions", this.handleSetPermissions.bind(this, user));
    user.socket.on("togglePlaylistLock", this.handleTogglePlaylistLock.bind(this, user));
    this.sendPermissions([user]);
    this.sendPlaylistLock([user]);
};

PermissionsModule.prototype.handleTogglePlaylistLock = function (user) {
    if (!this.hasPermission(user, "playlistlock")) {
        return;
    }

    this.dirty = true;
    this.openPlaylist = !this.openPlaylist;
    if (this.openPlaylist) {
        this.channel.logger.log("[playlist] " + user.getName() + " unlocked the playlist");
    } else {
        this.channel.logger.log("[playlist] " + user.getName() + " locked the playlist");
    }

    this.sendPlaylistLock(this.channel.users);
};

PermissionsModule.prototype.handleSetPermissions = function (user, perms) {
    if (typeof perms !== "object") {
        return;
    }

    if (!this.canSetPermissions(user)) {
        user.kick("Attempted setPermissions as a non-admin");
        return;
    }

    for (const key in perms) {
        if (typeof perms[key] !== "number") {
            perms[key] = parseFloat(perms[key]);
            if (isNaN(perms[key])) {
                delete perms[key];
            }
        }
    }

    for (const key in perms) {
        if (key in this.permissions) {
            this.permissions[key] = perms[key];
        }
    }

    if ("seeplaylist" in perms) {
        if (this.channel.modules.playlist) {
            this.channel.modules.playlist.sendPlaylist(this.channel.users);
        }
    }

    this.dirty = true;
    this.channel.logger.log("[mod] " + user.getName() + " updated permissions");
    this.sendPermissions(this.channel.users);
};

PermissionsModule.prototype.canAddVideo = function (account) {
    return this.hasPermission(account, "playlistadd");
};

PermissionsModule.prototype.canSetTemp = function (account) {
    return this.hasPermission(account, "settemp");
};

PermissionsModule.prototype.canSeePlaylist = function (account) {
    return this.hasPermission(account, "seeplaylist");
};

PermissionsModule.prototype.canAddList = function (account) {
    return this.hasPermission(account, "playlistaddlist");
};

PermissionsModule.prototype.canAddNonTemp = function (account) {
    return this.hasPermission(account, "addnontemp");
};

PermissionsModule.prototype.canAddNext = function (account) {
    return this.hasPermission(account, "playlistnext");
};

PermissionsModule.prototype.canAddLive = function (account) {
    return this.hasPermission(account, "playlistaddlive");
};

PermissionsModule.prototype.canAddCustom = function (account) {
    return this.hasPermission(account, "playlistaddcustom");
};

PermissionsModule.prototype.canAddRawFile = function (account) {
    return this.hasPermission(account, "playlistaddrawfile");
};

PermissionsModule.prototype.canMoveVideo = function (account) {
    return this.hasPermission(account, "playlistmove");
};

PermissionsModule.prototype.canDeleteVideo = function (account) {
    return this.hasPermission(account, "playlistdelete");
};

PermissionsModule.prototype.canSkipVideo = function (account) {
    return this.hasPermission(account, "playlistjump");
};

PermissionsModule.prototype.canToggleTemporary = function (account) {
    return this.hasPermission(account, "settemp");
};

PermissionsModule.prototype.canExceedMaxLength = function (account) {
    return this.hasPermission(account, "exceedmaxlength");
};

PermissionsModule.prototype.canExceedMaxDurationPerUser = function (account) {
    return this.hasPermission(account, "exceedmaxdurationperuser");
};

PermissionsModule.prototype.canShufflePlaylist = function (account) {
    return this.hasPermission(account, "playlistshuffle");
};

PermissionsModule.prototype.canClearPlaylist = function (account) {
    return this.hasPermission(account, "playlistclear");
};

PermissionsModule.prototype.canLockPlaylist = function (account) {
    return this.hasPermission(account, "playlistlock");
};

PermissionsModule.prototype.canAssignLeader = function (account) {
    return this.hasPermission(account, "leaderctl");
};

PermissionsModule.prototype.canControlPoll = function (account) {
    return this.hasPermission(account, "pollctl");
};

PermissionsModule.prototype.canVote = function (account) {
    return this.hasPermission(account, "pollvote");
};

PermissionsModule.prototype.canViewHiddenPoll = function (account) {
    return this.hasPermission(account, "viewhiddenpoll");
};

PermissionsModule.prototype.canVoteskip = function (account) {
    return this.hasPermission(account, "voteskip");
};

PermissionsModule.prototype.canSeeVoteskipResults = function (actor) {
    return this.hasPermission(actor, "viewvoteskip");
};

PermissionsModule.prototype.canMute = function (actor) {
    return this.hasPermission(actor, "mute");
};

PermissionsModule.prototype.canKick = function (actor) {
    return this.hasPermission(actor, "kick");
};

PermissionsModule.prototype.canBan = function (actor) {
    return this.hasPermission(actor, "ban");
};

PermissionsModule.prototype.canEditMotd = function (actor) {
    return this.hasPermission(actor, "motdedit");
};

PermissionsModule.prototype.canEditFilters = function (actor) {
    return this.hasPermission(actor, "filteredit");
};

PermissionsModule.prototype.canImportFilters = function (actor) {
    return this.hasPermission(actor, "filterimport");
};

PermissionsModule.prototype.canEditEmotes = function (actor) {
    return this.hasPermission(actor, "emoteedit");
};

PermissionsModule.prototype.canImportEmotes = function (actor) {
    return this.hasPermission(actor, "emoteimport");
};

PermissionsModule.prototype.canCallDrink = function (actor) {
    return this.hasPermission(actor, "drink");
};

PermissionsModule.prototype.canChat = function (actor) {
    return this.hasPermission(actor, "chat");
};

PermissionsModule.prototype.canClearChat = function (actor) {
    return this.hasPermission(actor, "chatclear");
};

PermissionsModule.prototype.canSetOptions = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 20;
};

PermissionsModule.prototype.canSetCSS = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 39;
};

PermissionsModule.prototype.canSetJS = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 39;
};

PermissionsModule.prototype.canSetPermissions = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 36;
};

PermissionsModule.prototype.canUncache = function (actor) {
    return this.hasPermission(actor, "deletefromchannellib");
};

PermissionsModule.prototype.canExceedMaxItemsPerUser = function (actor) {
    return this.hasPermission(actor, "exceedmaxitems");
};

PermissionsModule.prototype.loadUnregistered = function () {
    var perms = {
        seeplaylist: -1,
        playlistadd: 18,      // Add video to the playlist
        playlistnext: 18,
        playlistmove: 18,      // Move a video on the playlist
        playlistdelete: 18,    // Delete a video from the playlist
        playlistjump: 18,      // Start a different video on the playlist
        playlistaddlist: 18,   // Add a list of videos to the playlist
        oplaylistadd: 18,     // Same as above, but for open (unlocked) playlist
        oplaylistnext: 18,
        oplaylistmove: 18,
        oplaylistdelete: 18,
        oplaylistjump: 18,
        oplaylistaddlist: 18,
        playlistaddcustom: 18, // Add custom embed to the playlist
        playlistaddlive: 18,   // Add a livestream to the playlist
        exceedmaxlength: 18,   // Add a video longer than the maximum length set
        addnontemp: 18,        // Add a permanent video to the playlist
        settemp: 18,           // Toggle temporary status of a playlist item
        playlistshuffle: 18,   // Shuffle the playlist
        playlistclear: 18,     // Clear the playlist
        pollctl: 18,           // Open/close polls
        pollvote: 18,         // Vote in polls
        viewhiddenpoll: 18,  // View results of hidden polls
        voteskip: 18,         // Vote to skip the current video
        viewvoteskip: 18,    // View voteskip results
        playlistlock: 18,      // Lock/unlock the playlist
        leaderctl: 18,         // Give/take leader
        drink: 18,             // Use the /d command
        chat: 18,              // Send chat messages
        chatclear: 20,         // Use the /clear command
        exceedmaxitems: 20,    // Exceed max items per user
        deletefromchannellib: 20
    };

    for (var key in perms) {
        this.permissions[key] = perms[key];
    }

    this.openPlaylist = true;
};

module.exports = PermissionsModule;
