const admin = require('firebase-admin')
const axios = require('axios')
const firestore = admin.firestore()
const notificationsRef = firestore.collection('notifications')
const userClient = require('../core/user')

const { fetchUser, updateUser } = userClient

const sendPushNotification = async (
  toUserID,
  titleStr,
  contentStr,
  type,
  metadata = {},
) => {
  console.log(`sendPushNotification ${toUserID} ${titleStr} ${contentStr}`)

  const toUser = await fetchUser(toUserID)
  const { pushToken } = toUser
  console.log(`pushToken: ${pushToken}`)
  if (!pushToken) {
    return null
  }

  let fcmToken = toUser?.fcmToken
  if (!fcmToken) {
    // We have a push token, but not a fcm token, so we need to convert the push token to a fcm token
    fcmToken = await retrieveFCMTokenForPushToken(pushToken)
    console.log(`Retrieved fcmToken: ${fcmToken}`)
    if (fcmToken?.length > 0) {
      await updateUser(toUserID, { fcmToken })
    }
  }

  await saveNotificationsToDB(toUser, titleStr, contentStr, type, metadata)

  console.log(
    `Actually sending push notification to ${toUserID} with title ${titleStr} with content ${contentStr}`,
  )

  const userBadgeCount = await handleUserBadgeCount(toUser)
  console.log(`userBadgeCount: ${userBadgeCount}`)

  const data = {
    message: {
      token: fcmToken,
      notification: {
        title: titleStr,
        body: contentStr,
      },
      apns: {
        payload: {
          aps: {
            badge: userBadgeCount,
          },
        },
      },
    },
  }

  return admin.messaging().send(data.message)
}

const handleUserBadgeCount = async user => {
  const newBadgeCount = (user?.badgeCount ?? 0) + 1
  await updateUser(user.id, { badgeCount: newBadgeCount })
  return newBadgeCount
}

const saveNotificationsToDB = async (toUser, title, body, type, metadata) => {
  const notification = {
    toUserID: toUser.id,
    title,
    body,
    metadata,
    toUser,
    type,
    seen: false,
  }

  const ref = await notificationsRef.add({
    ...notification,
    createdAt: Math.floor(new Date().getTime() / 1000),
  })
  notificationsRef.doc(ref.id).update({ id: ref.id })
}

const getCircularReplacer = () => {
  const seen = new WeakSet()
  return (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return
      }
      seen.add(value)
    }
    return value
  }
}

const retrieveFCMTokenForPushToken = async pushToken => {
  const url = 'https://iid.googleapis.com/iid/v1:batchImport'
  let config = {
    headers: {
      Authorization:
        'key=AAAA_-2JkDo:APA91bFPHWEtBQfcPnMQbiahs4-5ikZDcbXrK_PuD8bTdKhhNjNhb0rwbpEOkMQx_YOJWIeJLWLB9-1iwm5KaFYo8kxz5ygjJ9DFLL0caG9oigCa-hh5qKsFA-Zyrd-r3v_v8NqAUYy_',
      'Content-Type': 'application/json',
    },
  }
  try {
    const res = await axios.post(
      url,
      {
        apns_tokens: [pushToken],
        application: 'io.instamobile.rn.ios',
        sandbox: false,
      },
      config,
    )
    // console.log(
    //   `res for FCM exchange:: ${JSON.stringify(res, getCircularReplacer())}`,
    // )
    console.log(res.data.results)
    return res.data.results[0].registration_token
  } catch (e) {
    console.log(`Error in FCM exchange:: ${e}`)
  }
  return null
}

exports.sendPushNotification = sendPushNotification
