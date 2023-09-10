const functions = require('firebase-functions')
const admin = require('firebase-admin')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

const { createChannel, insertMessage } = require('../chat/utils')
const { add } = require('../core/collections')
const { fetchUserByEmail, fetchUser, updateUser } = require('../core/user')
const {
  users,
  commmonPhotos,
  commonUserData,
  chatMessages,
} = require('./data/users')

const auth = admin.auth()

const db = admin.firestore()

exports.performSeeding = functions
  .runWith({
    timeoutSeconds: 540,
  })
  .https.onCall(async (data, context) => {
    console.log(`Seeding database: ${JSON.stringify(data)}`)

    await deleteAllCollections()

    const userIDs = await createUsers()


    await createChatChannelsAndMessages(userIDs)


    await importCollectionFromFile('universal_categories')
    await importCollectionFromFile('universal_filters')
    await importCollectionFromFile('universal_listings')








  })

const createUsers = async () => {
  console.log(`Creating Users`)
  var userIDs = []
  const promises = users.map(async (user, index) => {
    const { email, profilePictureURL } = user
    try {
      const userRecord = await auth.createUser({
        email: email,
        emailVerified: false,
        password: 'password1',
        disabled: false,
      })
      if (userRecord) {
        console.log('Successfully created new user:', userRecord?.uid)
        userIDs.push(userRecord.uid)
        await db
          .collection('users')
          .doc(userRecord.uid)
          .set({
            id: userRecord.uid,
            photos: [profilePictureURL, ...commmonPhotos],
            ...user,
            ...commonUserData,
          })
      } else {
        console.log('Failed to create user for :', email)
      }
    } catch (err) {
      const { id } = await fetchUserByEmail(email)
      await updateUser(id, {
        photos: [profilePictureURL, ...commmonPhotos],
        ...user,
        ...commonUserData,
      })
      userIDs.push(id)
    }
  })

  await Promise.all(promises)
  return userIDs
}



const createChatChannelsAndMessages = async userIDs => {
  console.log(`Seeding chat channels and messages for user ids ${userIDs}`)

  var hash = await getUsersHashForUserIDs(userIDs)

  const promises1 = userIDs.map(async userID => {
    const friends = userIDs.filter(id => id !== userID)
    const promises2 = friends.map(async friendID => {
      if (userID >= friendID) {
        return
      }
      const channelID = userID + friendID
      const sender = hash[userID]
      const recipient = hash[friendID]
      const timestamp = Math.floor(new Date().getTime() / 1000)

      await createChannel({
        id: channelID,
        creatorID: userID,
        createdAt: timestamp,
        name: '',
        participants: [sender, recipient],
      })

      const message1 =
        chatMessages[Math.floor(Math.random() * chatMessages.length)]
      var message2 =
        chatMessages[Math.floor(Math.random() * chatMessages.length)]
      while (message2 == message1) {
        message2 = chatMessages[Math.floor(Math.random() * chatMessages.length)]
      }

      await insertMessage({
        channelID: channelID,
        message: {
          id: uuidv4(),
          content: message1,
          createdAt: timestamp,
          recipientFirstName: '',
          recipientID: '',
          recipientLastName: '',
          recipientProfilePictureURL: '',
          senderFirstName: sender.firstName,
          senderID: sender.id,
          senderProfilePictureURL: sender.profilePictureURL,
          readUserIDs: [sender.id],
          participantProfilePictureURLs: [
            {
              profilePictureURL: sender.profilePictureURL,
              participantId: sender.id,
            },
            {
              profilePictureURL: recipient.profilePictureURL,
              participantId: recipient.id,
            },
          ],
        },
      })

      await insertMessage({
        channelID: channelID,
        message: {
          id: uuidv4(),
          content: message2,
          createdAt: timestamp,
          recipientFirstName: '',
          recipientID: '',
          recipientLastName: '',
          recipientProfilePictureURL: '',
          senderFirstName: recipient.firstName,
          senderID: recipient.id,
          senderProfilePictureURL: recipient.profilePictureURL,
          readUserIDs: [recipient.id],
          participantProfilePictureURLs: [
            {
              profilePictureURL: sender.profilePictureURL,
              participantId: sender.id,
            },
            {
              profilePictureURL: recipient.profilePictureURL,
              participantId: recipient.id,
            },
          ],
        },
      })

      console.log(`Created chat channel between ${userID} to ${friendID}`)
    })
    await Promise.all(promises2)
  })

  await Promise.all(promises1)
}

const importCollectionFromFile = async jsonFileName => {
  try {
    console.log(`Importing ${jsonFileName}`)
    let data = fs.readFileSync(
      path.resolve(`./seed/data/json/${jsonFileName}.json`),
    )
    const object = JSON.parse(data)
    await uploadToCollection(object)
  } catch (error) {
    console.log(`Error importing file ${jsonFileName}.json`)
    console.log(error)
  }
}

const uploadToCollection = async (dataObject, commonDocData = {}) => {
  for (const key in dataObject) {
    const collectionName = key
    const collectionObjects = dataObject[key]
    for (const docKey in collectionObjects) {
      if (collectionObjects.hasOwnProperty(docKey)) {
        await uploadDocToCollection(collectionName, docKey, {
          ...(collectionObjects[docKey] ? collectionObjects[docKey] : {}),
          ...commonDocData,
          createdAt: Math.floor(new Date().getTime() / 1000),
        })
      }
    }
  }
}

const uploadDocToCollection = async (collectionName, doc, data) => {
  try {
    await db.collection(collectionName).doc(doc).set(data)
    console.log(
      `${doc} is imported successfully to firestore in ${collectionName} collection!`,
    )
  } catch (error) {
    console.log(error)
  }
}

const getUsersHashForUserIDs = async userIDs => {
  var hash = {}
  const allUsersPromises = userIDs.map(async userID => {
    const data = await fetchUser(userID)
    hash[userID] = data
  })

  await Promise.all(allUsersPromises)
  return hash
}

const deleteAllCollections = async () => {
  console.log(`Deleting all collections first...`)
  const collections = [
    'social_graph',
    'categories',
    // 'users',
    'customers',
    'channels',
    'swipes',
    'reports',
    'hashtags',
    'entities',
    'social_feeds',
    'posts',
    'stories',
    'SocialNetwork_Posts',
    'avCalls',
    'avCallStatuses',
    'avCallConnectionData',
  ]
  for (var i = 0; i < collections.length; i++) {
    await deleteCollection(collections[i])
    console.log(`Deleted collection ${collections[i]}`)
  }
}

const tools = require('firebase-tools')

const deleteCollection = async collectionPath => {
  // console.log(`xxxx ${process.env.GCP_PROJECT}`)
  await tools.firestore.delete(collectionPath, {
    project: 'development-69cdc',
    recursive: true,
    yes: true,
    force: true,
  })
}
