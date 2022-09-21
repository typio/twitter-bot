import path from 'node:path'
import fs, { promises as fsPromises } from 'node:fs'


import { Client, auth } from "twitter-api-sdk"
import express from "express"
import dotenv from "dotenv"

dotenv.config()

const app = express()

const appClient = new Client(process.env.BEARER_TOKEN as string)


const authClient = new auth.OAuth2User({
    client_id: process.env.CLIENT_ID as string,
    client_secret: process.env.CLIENT_SECRET as string,
    callback: "http://127.0.0.1:3000/callback",
    scopes: ["tweet.read", "users.read", "offline.access", "follows.write"],
})

const client = new Client(authClient)

const STATE = "my-state"

app.get("/callback", async function (req, res) {
    try {
        const { code, state } = req.query
        if (state !== STATE) return res.status(500).send("State isn't matching")
        await authClient.requestAccessToken(code as string)
        res.redirect("/tweets")
    } catch (error) {
        console.log(error)
    }
})

app.get("/login", async function (req, res) {
    const authUrl = authClient.generateAuthURL({
        state: STATE,
        code_challenge_method: "s256",
    })
    res.redirect(authUrl)
})

app.get("/tweets", async function (req, res) {
    try {
        const tweets = await client.tweets.findTweetById("20")
        res.send(tweets)
    } catch (error) {
        console.log("tweets error", error)
    } finally {
        main()
    }
})

app.get("/revoke", async function (req, res) {
    try {
        const response = await authClient.revokeAccessToken()
        res.send(response)
    } catch (error) {
        console.log(error)
    }
})

app.listen(3000, () => {
    console.log(`Go here to login: http://127.0.0.1:3000/login`)
})

const followNewPeople = true
const targetMaxFollowers = 100
const followDuration = 1000 * 60 * 60 * 24 * 3

let timeOfLastFollow = new Date()
let currentTime = new Date()

const writeFollower = (account: any) => {
    fs.readFile('data/currentFollows.json', 'utf8', (err, data) => {
        if (err) {
            console.log(err)
        } else {
            let currentFollows = JSON.parse(data)
            currentFollows.accounts.push(account)
            let json = JSON.stringify(currentFollows)
            fs.writeFile('data/currentFollows.json', json, 'utf8', (err) => {
                if (err) throw err
                console.log('The file has been saved!')
            })
        }

    })
}

async function main() {



    try {
        let rules //= await client.tweets.getRules()
        // let rulesIds: string[] = []
        // rules.data?.forEach(async rule => { rulesIds.push(rule.id) })
        // await client.tweets.addOrDeleteRules(
        //     {
        //         delete: {
        //             ids: rulesIds
        //         }
        //     }
        // )

        await appClient.tweets.addOrDeleteRules(
            {
                add: [
                    { value: "is:reply lang:en (to:kirawontmiss OR to:OvOBrezzzy)" },
                ],
                // delete: {
                //     ids: ['1572476494689210371']
                // }
            }
        )
        rules = await appClient.tweets.getRules()
        console.log(rules)

        setTimeout(async () => {
            const stream = appClient.tweets.searchStream({
                "tweet.fields": ["author_id", "created_at", "text"],
            })
            for await (const tweet of stream) {
                try {
                    console.log(tweet.data?.author_id, tweet.data?.text)
                    if (followNewPeople) {
                        let targetUser = await appClient.users.findUserById(tweet.data?.author_id)
                        console.log(targetUser?.data?.public_metrics?.followers_count)

                        // if (targetUser?.data?.public_metrics?.followers_count < targetMaxFollowers) {
                        const followUser = (await client.users.usersIdFollow(
                            (process.env.CLIENT_ID as string),
                            {
                                target_user_id: tweet.data?.author_id,
                            }))

                        console.log(followUser)


                        if (followUser.data?.following) {
                            writeFollower({
                                id: tweet.data?.author_id,
                                text: tweet.data?.text,
                                followed: new Date()
                            })
                        }
                        // }
                    }
                } catch (err) {
                    console.log(err)

                }

            }
        }, 100)

    } catch (err) {
        console.log(err)
        setTimeout(() => {
            main()
        }, 1000 * 60 * 15)
    }

}

