const functions = require('firebase-functions')



const { updateChatFeedsUponReportedUser } = require('./common')

exports.onReportWrite = functions.firestore
  .document('user_reports/{user_reportID}')
  .onCreate(async (snapshot, context) => {
    const currentReportData = snapshot.data()

    console.log(
      `onCanonicalReportWrite  data: ${JSON.stringify(currentReportData)}`,
    )


    await updateChatFeedsUponReportedUser(
      currentReportData.source,
      currentReportData.dest,
    )

  })
