import * as React from 'react';
import { Route } from 'react-router';
import Ocarina from './components/Ocarina';

import './custom.css'

export default class App extends React.Component {
  static displayName = App.name;

  render () {
    return [
        <Route key="testPage" exact path='/' component={Ocarina} />,
        <Route key="obsPage" exact path='/t/:channelName/:botName/:authToken' component={Ocarina} />
    ];
  }
}
