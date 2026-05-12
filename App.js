import React from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import AuthScreen      from './src/screens/AuthScreen';
import HomeScreen      from './src/screens/HomeScreen';
import ProjectsScreen  from './src/screens/ProjectsScreen';
import ExpensesScreen  from './src/screens/ExpensesScreen';
import ProsScreen      from './src/screens/ProsScreen';
import BriefsScreen    from './src/screens/BriefsScreen';
import ProfileScreen   from './src/screens/ProfileScreen';
import { Colors } from './src/theme';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function TabIcon({ name, focused }) {
  const icons = {
    Home:     focused ? '🏠' : '🏠',
    Projects: focused ? '🏗️' : '🏗️',
    Market:   focused ? '🔍' : '🔍',
    Briefs:   focused ? '📝' : '📝',
    Profile:  focused ? '👤' : '👤',
  };
  return <View style={{ alignItems: 'center' }}>
    {/* Icon placeholder — react-navigation expects a component */}
    <View />
  </View>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 0.5,
          borderTopColor: Colors.border,
          paddingBottom: 8,
          paddingTop: 6,
          height: 62,
        },
        tabBarActiveTintColor: Colors.gold,
        tabBarInactiveTintColor: Colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarIcon: ({ focused, color, size }) => {
          const emojis = {
            Home: '🏠', Projects: '🏗️', Market: '🔍', Briefs: '📝', Profile: '👤',
          };
          const { Text } = require('react-native');
          return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emojis[route.name]}</Text>;
        },
      })}
    >
      <Tab.Screen name="Home"     component={HomeScreen}     options={{ tabBarLabel: 'Accueil' }} />
      <Tab.Screen name="Projects" component={ProjectsScreen} options={{ tabBarLabel: 'Projets' }} />
      <Tab.Screen name="Market"   component={ProsScreen}     options={{ tabBarLabel: 'Pros' }} />
      <Tab.Screen name="Briefs"   component={BriefsScreen}   options={{ tabBarLabel: 'Devis' }} />
      <Tab.Screen name="Profile"  component={ProfileScreen}  options={{ tabBarLabel: 'Profil' }} />
    </Tab.Navigator>
  );
}

function AppWithExpenses() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Expenses" component={ExpensesScreen}
        options={{ headerShown: true, title: '💰 Budget & Dépenses', headerTintColor: Colors.ink, headerStyle: { backgroundColor: Colors.white } }} />
    </Stack.Navigator>
  );
}

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.navy }}>
      <ActivityIndicator color={Colors.gold} size="large" />
    </View>
  );

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="App" component={AppWithExpenses} />
        ) : (
          <Stack.Screen name="Auth" component={AuthScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
