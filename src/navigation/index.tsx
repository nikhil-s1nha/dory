/**
 * Navigation configuration
 * Sets up React Navigation with bottom tabs and stack navigators
 */

import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createStackNavigator} from '@react-navigation/stack';
import {theme} from '@theme';

// Screens
import {ConnectScreen} from '@screens/ConnectScreen';
import {GamesScreen} from '@screens/GamesScreen';
import {DateIdeasScreen} from '@screens/DateIdeasScreen';
import {PhotosScreen} from '@screens/PhotosScreen';
import {ProfileScreen} from '@screens/ProfileScreen';

import type {MainTabParamList, RootStackParamList} from '@utils/types';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
      }}>
      <Tab.Screen name="Connect" component={ConnectScreen} />
      <Tab.Screen name="Games" component={GamesScreen} />
      <Tab.Screen name="DateIdeas" component={DateIdeasScreen} />
      <Tab.Screen name="Photos" component={PhotosScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

export const Navigation = () => {
  return (
    <NavigationContainer
      theme={{
        dark: false,
        colors: {
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
          notification: theme.colors.accent,
        },
      }}>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        <Stack.Screen name="Main" component={MainTabNavigator} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
