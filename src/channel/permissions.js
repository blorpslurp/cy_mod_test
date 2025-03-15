var ChannelModule = require("./module");
var User = require("../user");

const DEFAULT_PERMISSIONS = {
    seeplaylist: -1,          // See the playlist
    playlistadd: 1,         // Add video to the playlist
    playlistnext: 2,        // Add a video next on the playlist
    playlistmove: 4.5,        // Move a video on the playlist
    playlistdelete: 5,        // Delete a video from the playlist
    playlistjump: 4.5,        // Start a different video on the playlist
    playlistaddlist: 6,     // Add a list of videos to the playlist
    oplaylistadd: -1,         // Same as above, but for open (unlocked) playlist
    oplaylistnext: 1,
    oplaylistmove: 4.5,
    oplaylistdelete: 5,
    oplaylistjump: 4.5,
    oplaylistaddlist: 6,
    playlistaddcustom: 7,     // Add custom embed to the playlist
    playlistaddrawfile: 8,    // Add raw file to the playlist
    playlistaddlive: 5,     // Add a livestream to the playlist
    exceedmaxlength: 3,       // Add a video longer than the maximum length set
    addnontemp: 7,            // Add a permanent video to the playlist
    settemp: 7,               // Toggle temporary status of a playlist item
    playlistshuffle: 10,       // Shuffle the playlist
    playlistclear: 7,         // Clear the playlist
    pollctl: 5,             // Open/close polls
    pollvote: 1,             // Vote in polls
    viewhiddenpoll: 4.5,      // View results of hidden polls
    voteskip: 1,             // Vote to skip the current video
    viewvoteskip: 5,        // View voteskip results
    mute: 5,                // Mute other users
    kick: 5,                // Kick other users
    ban: 6,                   // Ban other users
    motdedit: 10,              // Edit the MOTD
    filteredit: 10,            // Control chat filters
    filterimport: 10,          // Import chat filter list
    emoteedit: 9,             // Control emotes
    emoteimport: 9,           // Import emote list
    playlistlock: 8,          // Lock/unlock the playlist
    leaderctl: 5,             // Give/take leader
    drink: 100,               // Use the /d command
    chat: 1,                  // Send chat messages
    chatclear: 5,             // Use the /clear command
    exceedmaxitems: 3,        // Exceed maximum items per user limit
    deletefromchannellib: 5,  // Delete channel library items
    exceedmaxdurationperuser: 4 // Exceed maximum total playlist length per user
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

    return actor.effectiveRank >= 6;
};

PermissionsModule.prototype.canSetCSS = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 10;
};

PermissionsModule.prototype.canSetJS = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 10;
};

PermissionsModule.prototype.canSetPermissions = function (actor) {
    if (actor instanceof User) {
        actor = actor.account;
    }

    return actor.effectiveRank >= 9;
};

PermissionsModule.prototype.canUncache = function (actor) {
    return this.hasPermission(actor, "deletefromchannellib");
};

PermissionsModule.prototype.canExceedMaxItemsPerUser = function (actor) {
    return this.hasPermission(actor, "exceedmaxitems");
};

PermissionsModule.prototype.loadUnregistered = function () {
    var perms = {
        seeplaylist: 4,
        playlistadd: 4,      // Add video to the playlist
        playlistnext: 4,
        playlistmove: 4.5,      // Move a video on the playlist
        playlistdelete: 4.5,    // Delete a video from the playlist
        playlistjump: 4.5,      // Start a different video on the playlist
        playlistaddlist: 4,   // Add a list of videos to the playlist
        oplaylistadd: 4,     // Same as above, but for open (unlocked) playlist
        oplaylistnext: 4,
        oplaylistmove: 4,
        oplaylistdelete: 4,
        oplaylistjump: 4,
        oplaylistaddlist: 4,
        playlistaddcustom: 4, // Add custom embed to the playlist
        playlistaddlive: 4,   // Add a livestream to the playlist
        exceedmaxlength: 4,   // Add a video longer than the maximum length set
        addnontemp: 5,        // Add a permanent video to the playlist
        settemp: 5,           // Toggle temporary status of a playlist item
        playlistshuffle: 5,   // Shuffle the playlist
        playlistclear: 6,     // Clear the playlist
        pollctl: 4.5,           // Open/close polls
        pollvote: 2,         // Vote in polls
        viewhiddenpoll: 4.5,  // View results of hidden polls
        voteskip: 2,         // Vote to skip the current video
        viewvoteskip: 4.5,    // View voteskip results
        playlistlock: 5,      // Lock/unlock the playlist
        leaderctl: 5,         // Give/take leader
        drink: 100,             // Use the /d command
        chat: 2,              // Send chat messages
        chatclear: 5,         // Use the /clear command
        exceedmaxitems: 4,    // Exceed max items per user
        deletefromchannellib: 4
    };

    for (var key in perms) {
        this.permissions[key] = perms[key];
    }

    this.openPlaylist = true;
};

module.exports = PermissionsModule;
