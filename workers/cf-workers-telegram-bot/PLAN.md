https://bugs.telegram.org/c/749

# Request
Add the ability to transfer ownership of sticker packs to other users.

## SubRequests
1. Retain usage statistics
2. Allow the new owner to update the sticker pack for all of its existing users

# In Scope
Copy a packs contents into another pack without stats and they would needs to share that one

## Stretch Goal
* Allow random sticker to be added to pack
* Offer commands to deprecate the old pack (Replace old stickers with Sticker notifying of move and directions/setup)

# Plan of attack
* /start
    * Explains the process, asked for pack using /transfer below
* /transfer https://t.me/addstickers/Taro38202NaL or /transfer then send sticker
    * If no pack tied to sticker, reject sticker (for now) - TODO Allow random sticker to be added to a pack
    * If pack does not exist anymore, reject sticker (for now) - TODO Allow random sticker to be added to a pack if possible (TODO need to confirm)
    * If sticker is malformed (not a sticker to Telegram), reject it.

    * Accepts pack then prompt for either new pack or existing pack to add to. (Note to user about ordering needs to happen after the transfer).
        * Shares a link to the new channel created and the commands to run for @Stickers (Shows example in screenshots)
        * If invite fails, notify user to explain how to allow.

* /cancel
* /stop
* /help
  * Explains the process, asked for pack using /transfer below
* /status (Admin only)
  * Health of the bot (ping)
* /done - deletes the channel and the messages in it.

Quote won't work in a channel, inline won't work, won't listen to channel posts, DMs only.

Accepts channel commands in the form of /done@<Botname> or /done

# Interesting links
![Links you can setup to hotlink into Telegram](https://github.com/telegramdesktop/tdesktop/blob/a919737f6ef98b56cd7db41577ecfc269a60f444/Telegram/SourceFiles/core/click_handler_types.cpp#L31)