import * as React from 'react';
import { RouteComponentProps } from 'react-router';
import { Client, Userstate } from 'tmi.js';
import * as Tone from 'tone';
import * as _ from 'lodash';

type OcarinaRouteParams = { channelName: string, botName: string, authToken: string };
type OcarinaState = { isLoading: boolean; testValue: string, showTestUI: boolean };

type OcarinaPitchOctave = { pitch: string; octave: number; sharp?: boolean; flat?: boolean; };
type OcarinaNote = { note: OcarinaPitchOctave[]; attackTime: Tone.Unit.Time; noteLength: number; }

export default class Ocarina extends React.Component<RouteComponentProps<OcarinaRouteParams>, OcarinaState> {
    static displayName = Ocarina.name;

    state: OcarinaState = {
        isLoading: true,
        showTestUI: false,
        testValue: ""
    };

    twitchClient: Client;
    audioContext: AudioContext;
    audioNode: AudioNode;
    synth: Tone.Sampler;

    componentDidMount() {
        var self = this;
        var channelName = this.props.match.params.channelName;
        var authToken = this.props.match.params.authToken;
        var botName = this.props.match.params.botName;

        let connectPromise = new Promise(() => true);
        if (channelName && authToken && botName) {
            console.log("connecting to twitch channel: ", channelName);

            this.twitchClient = new Client({
                options: { debug: true, messagesLogLevel: 'info' },
                connection: {
                    reconnect: true,
                    secure: true
                },
                identity: {
                    username: botName,
                    password: `oauth:${authToken}`
                },
                channels: [channelName]
            });

            connectPromise = this.twitchClient.connect().catch(console.error);
            this.twitchClient.on('message', this.onTwitchMessage.bind(self));
        } else {
            this.setState({ showTestUI: true });
        }

        self.synth = new Tone.Sampler({
            urls: {
                "A4": "A.wav",
                "B4": "B.wav",
                "D4": "D.wav",
                "D5": "D2.wav",
                "F4": "F.wav"
            },
            release: 0.4,
            baseUrl: "/notes/",
        }).toDestination();

        Promise.all([connectPromise, Tone.loaded()])
            .then(() => Tone.start())
            .then(() => {
                this.setState({ isLoading: false });
                console.log("bot data loaded");
            });
    }

    onTwitchMessage(channel: string, context: Userstate, msg: string, self: boolean) {
        if (self) return;
        if (this.state.isLoading) return;

        if (msg.toLowerCase() === "!ocarina") {
            this.twitchClient.say(channel, "Usage: !ocarina notes (^ v < > A) (eg: !ocarina ^vA~ ^vA~) | Note Modifiers: ~ lengthen, / shorten, # sharp, b flat, [notes] chord, + increase octave, - decrease octave, space is a pause. Input is case-insensitive.");
            return;
        }

        if (msg.toLowerCase().startsWith("!ocarina")) {
            let ocarinaText = msg.toLowerCase().substring("!ocarina".length + 1);
            this.playSound(channel, ocarinaText);
        }
    }

    async playSound(channel: string | null, noteText: string) {
        var synth = this.synth;
        console.log("playing: ", noteText);

        // A = D
        // Down = F
        // Up = D2
        // Right = A
        // Left = B

        var timePerNoteSection = 0.3;
        var attackTime = Tone.now();
        var notes: OcarinaNote[] = [];
        var currentNoteLetters: OcarinaPitchOctave[] = [];
        var currentNote: OcarinaNote | null = null;
        var tildeCount = 0;
        var buildingChord = false;

        for (var i = 0; i < noteText.length; i++) {
            var pushNote = false;
            var lastNote = _.last(currentNote?.note);

            switch (noteText[i]) {
                case '[':
                    buildingChord = true;
                    break;
                case ']':
                    buildingChord = false;
                    pushNote = true;
                    break;
                case '^':
                    currentNoteLetters.push({ pitch: 'D', octave: 5 });
                    pushNote = true;
                    break;
                case '<':
                    currentNoteLetters.push({ pitch: 'B', octave: 4 });
                    pushNote = true;
                    break;
                case '>':
                    currentNoteLetters.push({ pitch: 'A', octave: 4 });
                    pushNote = true;
                    break;
                case 'v':
                    currentNoteLetters.push({ pitch: 'F', octave: 4 });
                    pushNote = true;
                    break;
                case 'a':
                    currentNoteLetters.push({ pitch: 'D', octave: 4 });
                    pushNote = true;
                    break;
                case ' ':
                    currentNoteLetters = [];
                    pushNote = true;
                    break;
                case '~':
                    if (currentNote) {
                        currentNote.noteLength += timePerNoteSection;
                        attackTime += timePerNoteSection;
                        tildeCount += 1;

                        if (tildeCount > 7) {
                            currentNoteLetters = currentNote.note;
                            attackTime -= 0.7;
                            pushNote = true;
                            tildeCount = 0;
                        }
                    }
                    break;
                case '/':
                    if (currentNote) {
                        currentNote.noteLength -= 0.08;
                        attackTime -= 0.08;
                    }
                    break;
                case '+':
                    if (lastNote) {
                        lastNote.octave += 1;
                        if (lastNote.octave > 7) {
                            lastNote.octave = 7;
                        }
                    }
                    break;
                case '-':
                    if (lastNote) {
                        lastNote.octave -= 1;
                        if (lastNote.octave < 0) {
                            lastNote.octave = 0;
                        }
                    }
                    break;
                case '#':
                    if (lastNote) {
                        lastNote.sharp = true;
                    }
                    break;
                case 'b':
                    if (lastNote) {
                        lastNote.flat = true;
                    }
                    break;
            }

            if (pushNote && !buildingChord) {
                let note = { note: currentNoteLetters, attackTime: attackTime, noteLength: timePerNoteSection };

                currentNoteLetters = [];
                currentNote = note;
                notes.push(note);

                tildeCount = 0;
                attackTime = attackTime + note.noteLength;
            }
        }

        var totalSongLength = _.sumBy(notes, n => n.noteLength);
        if (totalSongLength >= 10 && channel) {
            this.twitchClient.say(channel, "Your notes are too powerful traveller.");
            return;
        }

        notes.forEach(note => {
            if (note.note.length > 0) {
                let playbackNotes = _.map(note.note, n => `${n.pitch}${n.sharp ? '#' : ''}${n.flat ? 'b' : ''}${n.octave}`);

                synth.triggerAttackRelease(playbackNotes, note.noteLength, note.attackTime);
            }
        });
    }

    playInputSound() {
        this.playSound(null, this.state.testValue.toLowerCase());
    }

    playFormSound(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        this.playSound(null, this.state.testValue.toLowerCase());
    }

    testInputChange(event: React.FormEvent<HTMLInputElement>) {
        this.setState({ testValue: event.currentTarget.value });
    }

    render() {
        if (!this.state.showTestUI) {
            return <div></div>;
        }

        return (
            <div>
                <p>Twitch Ocarina Test Page</p>
                <p>
                    Notes: <strong>^</strong> <strong>v</strong> <strong>&lt;</strong> <strong>&gt;</strong> <strong>A</strong>
                    <br /><small>(basically just up down left right A)</small>
                </p>
                <p>Modifiers:</p>
                <ul>
                    <li><strong>~</strong> make note longer</li>
                    <li><strong>/</strong> make note shorter</li>
                    <li><strong>#</strong> make note sharp</li>
                    <li><strong>b</strong> make note flat</li>
                    <li><strong>+</strong> increase note octave</li>
                    <li><strong>-</strong> decreate note octave</li>
                    <li><strong>space</strong> introduce a pause (can be modified with ~ and /)</li>
                    <li><strong>[notes]</strong> build a chord (can be modified with ~ and / after the ])</li>
                </ul>
                <form onSubmit={this.playFormSound.bind(this)}>
                    <input type="text" value={this.state.testValue} onChange={this.testInputChange.bind(this)} />
                    <button type="button" onClick={this.playInputSound.bind(this)}>Play</button>
                </form>
            </div>
        );
    }
}
